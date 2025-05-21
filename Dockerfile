
# Imagem base
FROM node:20-alpine

# Criar diretório de trabalho
WORKDIR /app

# Copiar arquivos de package.json e package-lock.json
COPY package*.json ./

# Instalar dependências da aplicação principal
RUN npm install

# Copiar package.json do worker e instalar suas dependências
COPY src/worker/package.json ./src/worker/
RUN cd ./src/worker && npm install

# Copiar código fonte
COPY . .

# Configurar timezone (opcional)
ENV TZ=America/Sao_Paulo

# Expor as portas para a aplicação web e healthcheck
EXPOSE 8080
EXPOSE 8081

# Comando para iniciar a aplicação web e o worker
# O worker será executado em segundo plano com um script de inicialização
CMD ["sh", "-c", "cd ./src/worker && node s3-to-sftp-worker.js & npm run dev"]
