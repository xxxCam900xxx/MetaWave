FROM node:22-alpine

WORKDIR /app

COPY app/metawave_app/ .
RUN npm install --legacy-peer-deps

EXPOSE 8081
CMD ["npm", "run", "web"]