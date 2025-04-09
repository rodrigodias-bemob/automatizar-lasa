
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
    bucket: process.env.S3_BUCKET || 'm4u-conciliation',
    region: process.env.S3_REGION || 'us-east-1',
    prefix: process.env.S3_PREFIX || 'lasa/inbound/',
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
  filePrefix: process.env.FILE_PREFIX || '2025',
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

// Função para renomear o arquivo removendo o sufixo "_RECHARGE_REPORT"
function renameFile(fileName) {
  // Verifica se o nome do arquivo contém "_RECHARGE_REPORT"
  if (fileName.includes('_RECHARGE_REPORT')) {
    // Remove o sufixo "_RECHARGE_REPORT" do nome do arquivo
    return fileName.replace('_RECHARGE_REPORT', '');
  }
  return fileName;
}

// Verifica se o arquivo do dia existe no S3
async function checkDailyFile() {
  const today = formatDate();
  // Usamos o prefixo configurado para buscar por qualquer arquivo que comece com esse prefixo
  const filePrefix = config.filePrefix;
  const s3Prefix = config.s3.prefix; // Prefixo do diretório no S3
  
  try {
    console.log(`Verificando existência de arquivos que começam com ${filePrefix} no bucket ${config.s3.bucket} no diretório ${s3Prefix}`);
    
    // Lista todos os arquivos no bucket com o prefixo do diretório e do arquivo
    const completePrefix = s3Prefix + filePrefix;
    const { Contents } = await s3.listObjects({ 
      Bucket: config.s3.bucket,
      Prefix: completePrefix
    }).promise();
    
    if (!Contents || Contents.length === 0) {
      console.log(`Nenhum arquivo encontrado com o prefixo ${completePrefix}`);
      await sendSlackAlert(`Nenhum arquivo encontrado com o prefixo ${completePrefix}`);
      return { 
        exists: false, 
        fileName: null 
      };
    }
    
    // Obtém o arquivo mais recente (assumindo que queremos o mais recente)
    const latestFile = Contents.sort((a, b) => 
      new Date(b.LastModified) - new Date(a.LastModified)
    )[0];
    
    if (latestFile) {
      console.log(`Arquivo mais recente encontrado: ${latestFile.Key}`);
      return { 
        exists: true, 
        fileName: latestFile.Key 
      };
    } else {
      console.log(`Nenhum arquivo válido encontrado com o prefixo ${completePrefix}`);
      await sendSlackAlert(`Nenhum arquivo válido encontrado com o prefixo ${completePrefix}`);
      return { 
        exists: false, 
        fileName: null 
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

// Baixa o arquivo do S3 e mantém em memória (sem gravar em disco)
async function downloadFileFromS3(fileName) {
  try {
    console.log(`Baixando arquivo ${fileName} do bucket ${config.s3.bucket} para memória`);
    
    const { Body } = await s3.getObject({
      Bucket: config.s3.bucket,
      Key: fileName,
    }).promise();
    
    console.log(`Arquivo baixado para memória com sucesso`);
    
    return {
      buffer: Body,
      fileName: path.basename(fileName)
    };
  } catch (error) {
    console.error(`Erro ao baixar arquivo ${fileName} do S3:`, error);
    await sendSlackAlert(`Erro ao baixar arquivo ${fileName} do S3: ${error.message}`);
    throw error;
  }
}

// Envia o arquivo para o SFTP diretamente da memória
async function uploadFileToSftp(fileData, originalFileName) {
  try {
    console.log(`Conectando ao servidor SFTP: ${config.sftp.host}`);
    
    await sftp.connect({
      host: config.sftp.host,
      port: config.sftp.port,
      username: config.sftp.username,
      password: config.sftp.password,
    });
    
    // Renomeia o arquivo antes de enviar para o SFTP
    const renamedFileName = renameFile(path.basename(originalFileName));
    const remotePath = `${config.sftp.directory}/${renamedFileName}`;
    const remoteDir = path.dirname(remotePath);
    
    console.log(`Nome original do arquivo: ${originalFileName}`);
    console.log(`Nome do arquivo após renomeação: ${renamedFileName}`);
    
    const dirExists = await sftp.exists(remoteDir);
    if (!dirExists) {
      console.log(`Criando diretório remoto: ${remoteDir}`);
      await sftp.mkdir(remoteDir, true);
    }
    
    console.log(`Enviando arquivo da memória para ${remotePath}`);
    // Usamos o buffer diretamente, sem necessidade de arquivo local
    const result = await sftp.put(fileData.buffer, remotePath);
    
    console.log(`Arquivo enviado com sucesso para ${remotePath}`);
    await sendSlackAlert(`✅ Arquivo ${renamedFileName} transferido com sucesso para o SFTP`);
    
    return {
      success: true,
      remotePath: remotePath,
      originalName: originalFileName,
      renamedTo: renamedFileName
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

// Função principal que orquestra todo o processo
async function transferDailyFileFromS3ToSftp() {
  console.log('Iniciando processo de transferência S3 -> SFTP');
  console.log(new Date().toISOString());
  
  try {
    // Verifica se o arquivo do dia existe
    const { exists, fileName } = await checkDailyFile();
    
    if (!exists || !fileName) {
      console.log('Arquivo diário não encontrado. Processo encerrado.');
      return {
        success: false,
        message: `Arquivo não encontrado no S3`
      };
    }
    
    // Baixa o arquivo do S3 para a memória
    const fileData = await downloadFileFromS3(fileName);
    
    // Envia o arquivo para o SFTP diretamente da memória
    const uploadResult = await uploadFileToSftp(fileData, fileName);
    
    console.log('Processo de transferência concluído com sucesso');
    return {
      success: true,
      message: `Arquivo ${fileName} transferido com sucesso para ${uploadResult.remotePath} com o novo nome ${uploadResult.renamedTo}`
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
