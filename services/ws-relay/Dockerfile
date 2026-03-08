FROM node:20-alpine

# sharp 0.33+ bundles its own libvips — do NOT install system vips-dev
# (system vips-dev can conflict with sharp's bundled version on Alpine)
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY index.js ./

EXPOSE 8080
CMD ["node", "index.js"]
