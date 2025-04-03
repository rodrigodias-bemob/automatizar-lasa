
# Worker de Transferência S3 para SFTP

Este worker automatiza o processo de transferência de arquivos do Amazon S3 para um servidor SFTP.

## Funcionalidades

- Verificação diária da existência de arquivos no bucket S3
- Download de arquivos do S3
- Upload de arquivos para servidor SFTP
- Notificações no Slack em caso de falhas ou sucesso
- Limpeza automática de arquivos temporários

## Instalação

```bash
cd src/worker
npm install
```

## Configuração

O worker pode ser configurado através de variáveis de ambiente:

### Variáveis Obrigatórias
- `S3_ACCESS_KEY`: Chave de acesso da AWS
- `S3_SECRET_KEY`: Chave secreta da AWS
- `S3_BUCKET`: Nome do bucket S3
- `SFTP_HOST`: Endereço do servidor SFTP
- `SFTP_USERNAME`: Usuário do SFTP
- `SFTP_PASSWORD`: Senha do SFTP

### Variáveis Opcionais
- `S3_REGION`: Região da AWS (padrão: 'us-east-1')
- `SFTP_PORT`: Porta do servidor SFTP (padrão: 22)
- `SFTP_DIRECTORY`: Diretório de destino no SFTP (padrão: '/')
- `SLACK_WEBHOOK_URL`: URL do webhook do Slack para notificações
- `FILE_PREFIX`: Prefixo do nome do arquivo a ser procurado (padrão: 'data')
- `TEMP_DIR`: Diretório temporário para arquivos baixados (padrão: './temp')

## Uso

Execute o worker manualmente:

```bash
npm start
```

### Docker

#### Construir a imagem

```bash
cd src/worker
docker build -t s3-to-sftp-worker .
```

#### Executar o container

```bash
docker run --name s3-to-sftp-worker \
  -e S3_ACCESS_KEY=sua_access_key \
  -e S3_SECRET_KEY=sua_secret_key \
  -e S3_BUCKET=nome_do_bucket \
  -e SFTP_HOST=endereco.sftp.com \
  -e SFTP_USERNAME=usuario \
  -e SFTP_PASSWORD=senha \
  -e SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz \
  s3-to-sftp-worker
```

Alternativamente, você pode usar um arquivo .env:

```bash
docker run --name s3-to-sftp-worker \
  --env-file .env \
  s3-to-sftp-worker
```

### Agendamento com Cron

Para executar o worker automaticamente todos os dias, adicione uma entrada no crontab:

```bash
# Executar todos os dias às 10:00
0 10 * * * cd /caminho/para/worker && npm start >> /var/log/s3-sftp-worker.log 2>&1
```

#### Agendamento com Docker

Se estiver usando Docker, você pode configurar um cron job para executar o container:

```bash
# Executar todos os dias às 10:00
0 10 * * * docker run --rm --env-file /caminho/para/.env s3-to-sftp-worker >> /var/log/s3-sftp-worker.log 2>&1
```

## Logs

O worker gera logs detalhados sobre cada etapa do processo. Em um ambiente de produção, considere usar um serviço de log como Winston ou Pino.
