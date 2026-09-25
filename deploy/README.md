# Hosted deployment (single VM, Docker Compose)

Layout on the server: repo at `/opt/tandur`, secrets in `/opt/tandur/deploy/.env` (never committed).
The stack runs as compose project `tandur` on the docker network `tandur_net`. Validator RPC ports are not
published; only the host's edge Caddy (TLS) reaches `tandur-web:80` and `tandur-operator:4600`.

First deploy
```bash
rsync -az --delete --exclude-from=.dockerignore ./ root@HOST:/opt/tandur/
ssh root@HOST 'cd /opt/tandur && cp deploy/env.example deploy/.env'   # then fill secrets
ssh root@HOST 'cd /opt/tandur && bash chain/setup.sh && PUB=$(sed s/^0x// chain/node1/key.pub) && sed -i "s/^BOOTNODE_PUB=.*/BOOTNODE_PUB=$PUB/" deploy/.env'
ssh root@HOST 'cd /opt/tandur && docker compose -f deploy/compose.yml up -d validator1 validator2 validator3 validator4 postgres'
ssh root@HOST 'cd /opt/tandur && docker compose -f deploy/compose.yml build operator web'
ssh root@HOST 'cd /opt/tandur && docker compose -f deploy/compose.yml --profile tools run --rm deployer'
ssh root@HOST 'cd /opt/tandur && docker compose -f deploy/compose.yml up -d operator web'
ssh root@HOST 'cd /opt/tandur && docker compose -f deploy/compose.yml --profile tools run --rm seed'
```
Then append `deploy/edge.Caddyfile.snippet` to the edge Caddyfile, attach that Caddy to `tandur_net`, and reload it.

Update: rsync again, then `docker compose -f deploy/compose.yml up -d --build operator web`.
Full reset of chain + data: `docker compose -f deploy/compose.yml down -v`, delete `chain/networkFiles chain/node*`, repeat first deploy from `chain/setup.sh`.
