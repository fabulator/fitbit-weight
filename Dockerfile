FROM fabulator/nodejs:latest

COPY ./node_modules /srv/node_modules
COPY ./dist /srv/

CMD node --no-warnings index.js
