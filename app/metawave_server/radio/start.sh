#!/bin/bash
set -e

if [ -z "$NGROK_AUTHTOKEN" ]; then
  echo "NGROK_AUTHTOKEN ist nicht gesetzt"
  exit 1
fi

ngrok config add-authtoken "$NGROK_AUTHTOKEN"

node ./server.js &

sleep 2

ngrok http 8000 --log=stdout &

wait