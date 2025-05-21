const AWS = require('aws-sdk');
const ftp = require('basic-ftp');
const axios = require('axios');
const path = require('path');
const { format } = require('date-fns');
const cron = require('node-cron');
const { Readable } = require('stream');
const http = require('http');

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
  healthcheck: {
    port: parseInt(process.env.HEALTHCHECK_PORT || '8081'),
    path: process.env.HEALTHCHECK_PATH || '/health',
  }
};

// Configuração do cliente S3
const s3 = new AWS.S3({
  accessKeyId: config.s3.accessKey,
  secretAccessKey: config.s3.secretKey,
  region: config.s3.region,
});

// Variáveis para rastrear status do worker
const workerStatus = {
  isRunning: false,
  lastRun: null,
  lastRunStatus: null,
  startTime: new Date(),
  totalRuns: 0,
  successfulRuns: 0,
  failedRuns: 0
};

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

// Baixa o arquivo do S3 e mantém em memória
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

// Cria um stream a partir de um buffer
function bufferToStream(buffer) {
  const readable = new Readable();
  readable._read = () => {}; // _read é necessário mas pode ser uma função vazia
  readable.push(buffer);
  readable.push(null);
  return readable;
}

// Envia o arquivo para o FTP diretamente da memória usando streams
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
    
    // Define o diretório de trabalho (se especificado e diferente de '/')
    if (config.ftp.directory && config.ftp.directory !== '/' && config.ftp.directory !== '.') {
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
          // Se não conseguir mudar de diretório, tentamos usar o diretório raiz
          await client.cd('/');
          console.log('Usando o diretório raiz para o upload');
        }
      }
    }
    
    // Converte o buffer em stream para upload direto da memória
    const fileStream = bufferToStream(fileData.buffer);
    
    // Upload do arquivo diretamente do stream
    console.log(`Enviando arquivo da memória para ${config.ftp.directory}/${renamedFileName}`);
    await client.uploadFrom(fileStream, renamedFileName);
    
    // Lista os arquivos no diretório atual para verificar o upload
    console.log('Verificando se o arquivo foi enviado:');
    const files = await client.list();
    const uploadedFile = files.find(file => file.name === renamedFileName);
    if (uploadedFile) {
      console.log(`Arquivo enviado confirmado: ${renamedFileName}, tamanho: ${uploadedFile.size} bytes`);
    } else {
      console.log(`Arquivo não encontrado após upload: ${renamedFileName}`);
    }
    
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
  
  workerStatus.isRunning = true;
  workerStatus.lastRun = new Date();
  
  try {
    // Verifica se o arquivo do dia existe
    const { exists, fileName } = await checkDailyFile();
    
    if (!exists || !fileName) {
      console.log('Arquivo diário não encontrado. Processo encerrado.');
      workerStatus.lastRunStatus = 'failure';
      workerStatus.failedRuns++;
      return {
        success: false,
        message: `Arquivo não encontrado no S3`
      };
    }
    
    // Baixa o arquivo do S3 para a memória
    const fileData = await downloadFileFromS3(fileName);
    
    // Envia o arquivo para o FTP diretamente da memória
    const uploadResult = await uploadFileToFtp(fileData, fileName);
    
    console.log('Processo de transferência concluído com sucesso');
    workerStatus.lastRunStatus = 'success';
    workerStatus.successfulRuns++;
    return {
      success: true,
      message: `Arquivo ${fileName} transferido com sucesso para ${uploadResult.remotePath} com o novo nome ${uploadResult.renamedTo}`
    };
  } catch (error) {
    console.error('Erro durante o processo de transferência:', error);
    workerStatus.lastRunStatus = 'failure';
    workerStatus.failedRuns++;
    return {
      success: false,
      message: `Erro durante a transferência: ${error.message}`
    };
  } finally {
    workerStatus.isRunning = false;
    workerStatus.totalRuns++;
  }
}

// Inicia o servidor HTTP para endpoint de healthcheck
function startHealthcheckServer() {
  const server = http.createServer((req, res) => {
    if (req.url === config.healthcheck.path && req.method === 'GET') {
      const health = {
        status: 'UP',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((new Date() - workerStatus.startTime) / 1000),
        worker: {
          isRunning: workerStatus.isRunning,
          lastRun: workerStatus.lastRun ? workerStatus.lastRun.toISOString() : null,
          lastRunStatus: workerStatus.lastRunStatus,
          stats: {
            totalRuns: workerStatus.totalRuns,
            successfulRuns: workerStatus.successfulRuns,
            failedRuns: workerStatus.failedRuns
          },
          cronSchedule: config.cronSchedule
        }
      };
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health, null, 2));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(config.healthcheck.port, () => {
    console.log(`Healthcheck server rodando na porta ${config.healthcheck.port}`);
    console.log(`Endpoint de healthcheck disponível em: http://localhost:${config.healthcheck.port}${config.healthcheck.path}`);
  });

  // Adicionar tratamento de erro para o servidor
  server.on('error', (error) => {
    console.error(`Erro no servidor de healthcheck: ${error.message}`);
    if (error.code === 'EADDRINUSE') {
      console.error(`A porta ${config.healthcheck.port} já está em uso. Escolha outra porta.`);
    }
  });

  return server;
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
      console.log('Resultado do processo:', result);
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
  // Inicia o servidor de healthcheck
  const healthcheckServer = startHealthcheckServer();
  
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
  console.log(`Healthcheck disponível em: http://localhost:${config.healthcheck.port}${config.healthcheck.path}`);

  // Configurar manipuladores de eventos para desligar graciosamente
  process.on('SIGTERM', () => {
    console.log('Recebido sinal SIGTERM. Encerrando worker...');
    if (healthcheckServer) {
      healthcheckServer.close(() => {
        console.log('Servidor de healthcheck encerrado.');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });

  process.on('SIGINT', () => {
    console.log('Recebido sinal SIGINT. Encerrando worker...');
    if (healthcheckServer) {
      healthcheckServer.close(() => {
        console.log('Servidor de healthcheck encerrado.');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
}

// Inicia o worker
main().catch(error => {
  console.error('Erro fatal no worker:', error);
  process.exit(1);
});
