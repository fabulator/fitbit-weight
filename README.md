# Fitbit Weight

This app will create authorization link with Fitbit account and listen to all changes in users weight. It will send payload to redis bullmq server.

## ENV variables

Check [example env file](.env.example) to find out everyhing about required .env variables.

## Docker

Check [example docker-compose.yml](docker-compose.yml) how to setup connection between containers and persisted volumes.
