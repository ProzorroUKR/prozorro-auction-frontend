FROM node:9.6.1 AS nodejs
WORKDIR /build/
ENV PATH /build/node_modules/.bin:/build:$PATH

COPY package.json .
COPY yarn.lock .
RUN npm run develop
RUN ls -l /build/node_modules
COPY . .
RUN npm run build


FROM nginx as prod

COPY --from=nodejs /build/build /app
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN useradd -m -u 10000 -U user
RUN chown -R user:user /app /etc/nginx /var/cache/nginx /run
EXPOSE 8080

FROM prod
USER user
