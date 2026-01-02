FROM node:20-slim

WORKDIR /app

COPY package*.json ./
# Install Python and dependencies for twstock
RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*
RUN pip3 install twstock lxml --break-system-packages

RUN npm install --production

COPY . .

EXPOSE 8080
CMD ["npm", "start"]
