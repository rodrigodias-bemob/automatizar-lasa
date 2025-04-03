
FROM node:20-alpine

# Criar diretório de trabalho
WORKDIR /app

# Copiar arquivos de package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar código fonte
COPY . .

# Criar diretório para arquivos temporários
RUN mkdir -p ./temp

# Configurar timezone (opcional)
ENV TZ=America/Sao_Paulo

# Comando para iniciar a aplicação
CMD ["node", "s3-to-sftp-worker.js"]
