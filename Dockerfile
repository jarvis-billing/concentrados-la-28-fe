# Usa una imagen base oficial de Node.js
FROM node:18

# Establece el directorio de trabajo
WORKDIR /app

# Copia el archivo package.json y package-lock.json
COPY package*.json ./

# Instala las dependencias
RUN npm install

# Copia el resto de la aplicación
COPY . .

# Construye la aplicación para producción
RUN npm run build --prod

# Usa una imagen base de Nginx para servir la aplicación
FROM nginx:stable

# Copia los archivos construidos de la aplicación Angular al directorio de Nginx
COPY --from=0 /app/dist/jarvis-fe /usr/share/nginx/html

# Expone el puerto que usará la aplicación
EXPOSE 80

# Define el comando para ejecutar Nginx
CMD ["nginx", "-g", "daemon off;"]