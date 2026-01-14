#!/bin/bash
set -e

ngrok authtoken 34VCdTKEUGPRYnik1HjPuwe5wKb_6dKCjau1Sf3x3n2foD6sK

node ./server.js &

sleep 2

ngrok http 8000 --log=stdout &

wait