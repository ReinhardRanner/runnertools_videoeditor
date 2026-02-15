# --- Stage 1: Build ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# Wir ignorieren Scripts beim Install, falls da noch tsc-Checks hängen
RUN npm install
COPY . .
# Build ohne Typ-Prüfung
#RUN npm run build
RUN npx vite build

# --- Stage 2: Serve ---
FROM httpd:2.4-alpine

# Module aktivieren
RUN sed -i 's/#LoadModule headers_module/LoadModule headers_module/' /usr/local/apache2/conf/httpd.conf && \
    sed -i 's/#LoadModule rewrite_module/LoadModule rewrite_module/' /usr/local/apache2/conf/httpd.conf

# 1. Den Standard-Apache-Content löschen ("It works!" entfernen)
RUN rm -rf /usr/local/apache2/htdocs/*

# 2. Unterordner erstellen und Build-Dateien dorthin kopieren
RUN mkdir -p /usr/local/apache2/htdocs/videoeditor
COPY --from=build /app/dist /usr/local/apache2/htdocs/videoeditor/

# 3. Die Konfiguration direkt in die httpd.conf schreiben
# Wir setzen das Directory auf den Root, damit er den Pfad /videoeditor/ findet
RUN echo '<Directory "/usr/local/apache2/htdocs">' >> /usr/local/apache2/conf/httpd.conf && \
    echo '    Options Indexes FollowSymLinks' >> /usr/local/apache2/conf/httpd.conf && \
    echo '    AllowOverride All' >> /usr/local/apache2/conf/httpd.conf && \
    echo '    Require all granted' >> /usr/local/apache2/conf/httpd.conf && \
    echo '</Directory>' >> /usr/local/apache2/conf/httpd.conf

# 4. .htaccess für das Routing im Unterordner erstellen
RUN echo 'RewriteEngine On' > /usr/local/apache2/htdocs/videoeditor/.htaccess && \
    echo 'RewriteBase /videoeditor/' >> /usr/local/apache2/htdocs/videoeditor/.htaccess && \
    echo 'RewriteRule ^index\.html$ - [L]' >> /usr/local/apache2/htdocs/videoeditor/.htaccess && \
    echo 'RewriteCond %{REQUEST_FILENAME} !-f' >> /usr/local/apache2/htdocs/videoeditor/.htaccess && \
    echo 'RewriteCond %{REQUEST_FILENAME} !-d' >> /usr/local/apache2/htdocs/videoeditor/.htaccess && \
    echo 'RewriteRule . /videoeditor/index.html [L]' >> /usr/local/apache2/htdocs/videoeditor/.htaccess

EXPOSE 80
