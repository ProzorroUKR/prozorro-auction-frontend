FROM docker-registry.prozorro.gov.ua/docker/images/node:10-alpine3.7.3 AS nodejs
WORKDIR /build/
ENV PATH /build/node_modules/.bin:/build:$PATH

COPY package.json .
COPY yarn.lock .
RUN npm run develop
RUN ls -l /build/node_modules
COPY . .
RUN npm run build


FROM docker-registry.prozorro.gov.ua/docker/images/nginx:1.21.3-alpine as prod

COPY --from=nodejs /build/build /app
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN addgroup -g 10000 user
RUN adduser -D -u 10000 -G user user
RUN chown -R user:user /app /etc/nginx /var/cache/nginx /run
EXPOSE 8080

FROM prod
USER user
