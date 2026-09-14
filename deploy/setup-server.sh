#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu VM (Oracle Cloud Always Free, ARM or x86).
#
#   curl -fsSL https://raw.githubusercontent.com/iamsiddhesh-dev/verdict/main/deploy/setup-server.sh | bash
#
# Installs Docker, opens ports 80 and 443 in the VM's own firewall, and clones
# the repository into ~/verdict. It does not touch secrets: create ~/verdict/.env
# yourself afterwards.
set -euo pipefail

echo "==> Updating packages"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
# Pre-answer iptables-persistent's "save current rules?" prompts.
echo "iptables-persistent iptables-persistent/autosave_v4 boolean true" | sudo debconf-set-selections
echo "iptables-persistent iptables-persistent/autosave_v6 boolean true" | sudo debconf-set-selections
sudo -E apt-get install -y ca-certificates curl git iptables-persistent

echo "==> Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"

echo "==> Opening ports 80 and 443"
# Oracle's Ubuntu images ship an iptables policy that rejects everything except
# SSH, in addition to the security list in the cloud console. Both must allow it.
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    # Insert above the image's catch-all REJECT rule, or at the top if there is none.
    reject_line="$(sudo iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')"
    sudo iptables -I INPUT "${reject_line:-1}" -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  fi
done
sudo netfilter-persistent save

echo "==> Getting the code"
if [ ! -d "$HOME/verdict" ]; then
  git clone https://github.com/iamsiddhesh-dev/verdict.git "$HOME/verdict"
else
  git -C "$HOME/verdict" pull --ff-only
fi

cat <<'EOF'

Done. Next:
  1. Log out and back in (so Docker works without sudo).
  2. cd ~/verdict && nano .env      (paste your variables, plus DOMAIN=...)
  3. docker compose up -d --build
EOF
