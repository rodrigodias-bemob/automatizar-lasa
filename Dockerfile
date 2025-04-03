
# Imagem base
FROM node:20-alpine

# Criar diretório de trabalho
WORKDIR /app

# Copiar arquivos de package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar código fonte
COPY . .

# Criar diretório para arquivos temporários do worker
RUN mkdir -p ./src/worker/temp

# Configurar timezone (opcional)
ENV TZ=America/Sao_Paulo

# Expor a porta para a aplicação web
EXPOSE 8080

# Comando para iniciar a aplicação web e o worker
# O worker será executado em segundo plano com um script de inicialização
CMD ["sh", "-c", "cd ./src/worker && node s3-to-sftp-worker.js & npm run dev"]
