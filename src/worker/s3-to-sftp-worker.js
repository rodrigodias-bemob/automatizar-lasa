
const AWS = require('aws-sdk');
const ftp = require('basic-ftp');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');
const cron = require('node-cron');

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
  ftp: {
    host: process.env.FTP_HOST,
    port: parseInt(process.env.FTP_PORT || '21'),
    username: process.env.FTP_USERNAME,
    password: process.env.FTP_PASSWORD,
    directory: process.env.FTP_DIRECTORY || '/put',
    secure: process.env.FTP_SECURE === 'true',
  },
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
  },
  filePrefix: process.env.FILE_PREFIX || '2025',
  cronSchedule: process.env.CRON_SCHEDULE || '0 10 * * *', // Padrão: todos os dias às 10h
  runOnStart: process.env.RUN_ON_START === 'true' || true,  // Executa ao iniciar, por padrão
};

// Configuração do cliente S3
const s3 = new AWS.S3({
  accessKeyId: config.s3.accessKey,
  secretAccessKey: config.s3.secretKey,
  region: config.s3.region,
});

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
      text: `[S3 para FTP] 🚨 ALERTA: ${message}`,
    });
    
    console.log('Notificação enviada com sucesso para o Slack');
  } catch (error) {
    console.error('Erro ao enviar notificação para o Slack:', error);
  }
}

// Baixa o arquivo do S3 e mantém em memória (sem gravar em disco)
async function downloadFileFromS3(fileName) {
  try {
    console.log(`Baixando arquivo ${fileName} do bucket ${config.s3.bucket}`);
    
    const { Body } = await s3.getObject({
      Bucket: config.s3.bucket,
      Key: fileName,
    }).promise();
    
    console.log(`Arquivo baixado com sucesso`);
    
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

// Envia o arquivo para o FTP usando um arquivo temporário
async function uploadFileToFtp(fileData, originalFileName) {
  const client = new ftp.Client();
  client.ftp.verbose = true;
  
  try {
    console.log(`Conectando ao servidor FTP: ${config.ftp.host}`);
    
    // Configurando o cliente FTP
    await client.access({
      host: config.ftp.host,
      port: config.ftp.port,
      user: config.ftp.username,
      password: config.ftp.password,
      secure: config.ftp.secure,
    });
    
    // Renomeia o arquivo antes de enviar para o FTP
    const renamedFileName = renameFile(path.basename(originalFileName));
    
    console.log(`Nome original do arquivo: ${originalFileName}`);
    console.log(`Nome do arquivo após renomeação: ${renamedFileName}`);
    
    // Cria um diretório temporário se não existir
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log(`Diretório temporário criado: ${tempDir}`);
    }
    
    // Caminho para o arquivo temporário
    const tempFilePath = path.join(tempDir, renamedFileName);
    console.log(`Criando arquivo temporário em: ${tempFilePath}`);
    
    // Grava o buffer em um arquivo temporário
    fs.writeFileSync(tempFilePath, fileData.buffer);
    const fileSizeBytes = fs.statSync(tempFilePath).size;
    console.log(`Arquivo temporário criado com tamanho: ${fileSizeBytes} bytes`);
    
    // Verifica o diretório atual
    const currentDir = await client.pwd();
    console.log(`Diretório atual no FTP: ${currentDir}`);
    
    // Define o diretório de trabalho (se especificado e diferente de '/')
    if (config.ftp.directory && config.ftp.directory !== '/' && config.ftp.directory !== currentDir) {
      try {
        await client.cd(config.ftp.directory);
        console.log(`Diretório alterado para: ${config.ftp.directory}`);
      } catch (dirError) {
        console.log(`Diretório ${config.ftp.directory} não encontrado. Tentando criar...`);
        try {
          await client.ensureDir(config.ftp.directory);
          console.log(`Diretório ${config.ftp.directory} criado com sucesso`);
        } catch (mkdirError) {
          console.error(`Erro ao criar diretório: ${mkdirError.message}`);
          throw mkdirError;
        }
      }
    }
    
    // Upload do arquivo a partir do arquivo temporário
    console.log(`Iniciando upload do arquivo: ${tempFilePath} para o FTP como: ${renamedFileName}`);
    await client.uploadFrom(tempFilePath, renamedFileName);
    
    // Lista os arquivos no diretório atual para verificar o upload
    console.log('Verificando se o arquivo foi enviado:');
    const files = await client.list();
    const uploadedFile = files.find(file => file.name === renamedFileName);
    if (uploadedFile) {
      console.log(`Arquivo enviado confirmado: ${renamedFileName}, tamanho: ${uploadedFile.size} bytes`);
    } else {
      console.log(`Arquivo não encontrado após upload: ${renamedFileName}`);
    }
    
    // Remove o arquivo temporário após o envio
    fs.unlinkSync(tempFilePath);
    console.log(`Arquivo temporário removido: ${tempFilePath}`);
    
    console.log(`Arquivo enviado com sucesso para o FTP como: ${renamedFileName}`);
    await sendSlackAlert(`✅ Arquivo ${renamedFileName} transferido com sucesso para o FTP`);
    
    return {
      success: true,
      remotePath: `${config.ftp.directory}/${renamedFileName}`,
      originalName: originalFileName,
      renamedTo: renamedFileName
    };
  } catch (error) {
    console.error('Erro ao enviar arquivo para FTP:', error);
    await sendSlackAlert(`❌ Erro ao enviar arquivo para FTP: ${error.message}`);
    throw error;
  } finally {
    client.close();
    console.log('Conexão FTP encerrada');
  }
}

// Função principal que orquestra todo o processo
async function transferDailyFileFromS3ToFtp() {
  console.log('Iniciando processo de transferência S3 -> FTP');
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
    
    // Envia o arquivo para o FTP a partir do arquivo temporário
    const uploadResult = await uploadFileToFtp(fileData, fileName);
    
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

// Função para iniciar a tarefa agendada
function setupScheduler() {
  console.log(`Configurando job agendado com cron: ${config.cronSchedule}`);

  // Registra a tarefa agendada usando cron
  cron.schedule(config.cronSchedule, async () => {
    console.log(`Executando job agendado em ${new Date().toISOString()}`);
    try {
      const result = await transferDailyFileFromS3ToFtp();
      console.log(`Job agendado concluído com status: ${result.success ? 'Sucesso' : 'Falha'}`);
    } catch (error) {
      console.error('Erro ao executar job agendado:', error);
      await sendSlackAlert(`Erro ao executar job agendado: ${error.message}`);
    }
  }, {
    scheduled: true,
    timezone: 'America/Sao_Paulo' // Configura para o fuso horário do Brasil
  });
  
  console.log('Job agendado configurado com sucesso');
}

// Função principal
async function main() {
  // Configura o scheduler com o cron
  setupScheduler();
  
  // Se configurado para rodar na inicialização, executa uma vez
  if (config.runOnStart) {
    console.log('Executando transferência inicial...');
    try {
      const result = await transferDailyFileFromS3ToFtp();
      console.log('Resultado da transferência inicial:', result);
    } catch (error) {
      console.error('Erro na transferência inicial:', error);
    }
  }
  
  // Mantém o processo rodando
  console.log('Worker está rodando e aguardando próximas execuções agendadas...');
}

// Inicia o worker
main().catch(error => {
  console.error('Erro fatal no worker:', error);
  process.exit(1);
});
