
const AWS = require('aws-sdk');
const Client = require('ssh2-sftp-client');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');

// Configurações - estas devem ser carregadas de um arquivo de configuração
// ou variáveis de ambiente em um ambiente de produção
const config = {
  s3: {
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION || 'us-east-1',
  },
  sftp: {
    host: process.env.SFTP_HOST,
    port: parseInt(process.env.SFTP_PORT || '22'),
    username: process.env.SFTP_USERNAME,
    password: process.env.SFTP_PASSWORD,
    directory: process.env.SFTP_DIRECTORY || '/',
  },
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
  },
  filePrefix: process.env.FILE_PREFIX || 'data',
  tempDir: process.env.TEMP_DIR || './temp',
};

// Configuração do cliente S3
const s3 = new AWS.S3({
  accessKeyId: config.s3.accessKey,
  secretAccessKey: config.s3.secretKey,
  region: config.s3.region,
});

// Cliente SFTP
const sftp = new Client();

// Função para formatar a data atual ou uma data específica
function formatDate(date = new Date()) {
  return format(date, 'yyyy-MM-dd');
}

// Verifica se o arquivo do dia existe no S3
async function checkDailyFile() {
  const today = formatDate();
  const expectedFileName = `${config.filePrefix}-${today}.csv`;
  
  try {
    console.log(`Verificando existência do arquivo ${expectedFileName} no bucket ${config.s3.bucket}`);
    
    // Lista todos os arquivos no bucket
    const { Contents } = await s3.listObjects({ 
      Bucket: config.s3.bucket,
      Prefix: config.filePrefix
    }).promise();
    
    // Verifica se há algum arquivo correspondente ao padrão do dia
    const dailyFile = Contents.find(file => 
      file.Key.includes(expectedFileName));
    
    if (dailyFile) {
      console.log(`Arquivo do dia encontrado: ${dailyFile.Key}`);
      return { 
        exists: true, 
        fileName: dailyFile.Key 
      };
    } else {
      console.log(`Arquivo do dia não encontrado: ${expectedFileName}`);
      
      // Envia alerta para o Slack
      await sendSlackAlert(`Arquivo diário não encontrado: ${expectedFileName}`);
      
      return { 
        exists: false, 
        fileName: expectedFileName 
      };
    }
  } catch (error) {
    console.error('Erro ao verificar arquivo no S3:', error);
    await sendSlackAlert(`Erro ao verificar arquivo no S3: ${error.message}`);
    throw error;
  }
}

// Função para enviar mensagem ao Slack
async function sendSlackAlert(message) {
  if (!config.slack.webhookUrl) {
    console.log('URL do webhook do Slack não configurada. Pulando notificação.');
    return;
  }
  
  try {
    console.log(`Enviando alerta para o Slack: ${message}`);
    
    await axios.post(config.slack.webhookUrl, {
      text: `[S3 para SFTP] 🚨 ALERTA: ${message}`,
    });
    
    console.log('Notificação enviada com sucesso para o Slack');
  } catch (error) {
    console.error('Erro ao enviar notificação para o Slack:', error);
  }
}

// Baixa o arquivo do S3 para o diretório temporário local
async function downloadFileFromS3(fileName) {
  // Garante que o diretório temporário existe
  if (!fs.existsSync(config.tempDir)) {
    fs.mkdirSync(config.tempDir, { recursive: true });
  }
  
  const localFilePath = path.join(config.tempDir, path.basename(fileName));
  
  try {
    console.log(`Baixando arquivo ${fileName} do bucket ${config.s3.bucket}`);
    
    const { Body } = await s3.getObject({
      Bucket: config.s3.bucket,
      Key: fileName,
    }).promise();
    
    fs.writeFileSync(localFilePath, Body);
    console.log(`Arquivo baixado para ${localFilePath}`);
    
    return localFilePath;
  } catch (error) {
    console.error(`Erro ao baixar arquivo ${fileName} do S3:`, error);
    await sendSlackAlert(`Erro ao baixar arquivo ${fileName} do S3: ${error.message}`);
    throw error;
  }
}

// Envia o arquivo para o SFTP
async function uploadFileToSftp(localFilePath, remoteFileName) {
  try {
    console.log(`Conectando ao servidor SFTP: ${config.sftp.host}`);
    
    await sftp.connect({
      host: config.sftp.host,
      port: config.sftp.port,
      username: config.sftp.username,
      password: config.sftp.password,
    });
    
    // Verifica se o diretório remoto existe
    const remotePath = `${config.sftp.directory}/${remoteFileName}`;
    const remoteDir = path.dirname(remotePath);
    
    const dirExists = await sftp.exists(remoteDir);
    if (!dirExists) {
      console.log(`Criando diretório remoto: ${remoteDir}`);
      await sftp.mkdir(remoteDir, true);
    }
    
    console.log(`Enviando ${localFilePath} para ${remotePath}`);
    const result = await sftp.put(localFilePath, remotePath);
    
    console.log(`Arquivo enviado com sucesso para ${remotePath}`);
    await sendSlackAlert(`✅ Arquivo ${remoteFileName} transferido com sucesso para o SFTP`);
    
    return {
      success: true,
      remotePath: remotePath
    };
  } catch (error) {
    console.error('Erro ao enviar arquivo para SFTP:', error);
    await sendSlackAlert(`❌ Erro ao enviar arquivo para SFTP: ${error.message}`);
    throw error;
  } finally {
    try {
      await sftp.end();
      console.log('Conexão SFTP encerrada');
    } catch (endError) {
      console.error('Erro ao encerrar conexão SFTP:', endError);
    }
  }
}

// Limpa arquivos temporários
function cleanupTempFile(filePath) {
  try {
    fs.unlinkSync(filePath);
    console.log(`Arquivo temporário ${filePath} removido`);
  } catch (error) {
    console.error(`Erro ao remover arquivo temporário ${filePath}:`, error);
  }
}

// Função principal que orquestra todo o processo
async function transferDailyFileFromS3ToSftp() {
  console.log('Iniciando processo de transferência S3 -> SFTP');
  console.log(new Date().toISOString());
  
  try {
    // Verifica se o arquivo do dia existe
    const { exists, fileName } = await checkDailyFile();
    
    if (!exists) {
      console.log('Arquivo diário não encontrado. Processo encerrado.');
      return {
        success: false,
        message: `Arquivo ${fileName} não encontrado no S3`
      };
    }
    
    // Baixa o arquivo do S3
    const localFilePath = await downloadFileFromS3(fileName);
    
    // Envia o arquivo para o SFTP
    const remoteFileName = path.basename(fileName);
    const uploadResult = await uploadFileToSftp(localFilePath, remoteFileName);
    
    // Limpa arquivos temporários
    cleanupTempFile(localFilePath);
    
    console.log('Processo de transferência concluído com sucesso');
    return {
      success: true,
      message: `Arquivo ${fileName} transferido com sucesso para ${uploadResult.remotePath}`
    };
  } catch (error) {
    console.error('Erro durante o processo de transferência:', error);
    return {
      success: false,
      message: `Erro durante a transferência: ${error.message}`
    };
  }
}

// Execute o processo
transferDailyFileFromS3ToSftp()
  .then(result => {
    console.log('Resultado do processo:', result);
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Erro fatal no processo:', error);
    process.exit(1);
  });
