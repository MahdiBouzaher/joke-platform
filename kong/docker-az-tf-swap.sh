#!/bin/bash

# This file creates a swapfile to assist low memory VMs
# installs Docker but doesn't add the user to Docker group as that causes problems with Terraform shell change
# So need to add the newgrp and user change in terraform or manually with a new ssh session
# Probably better to add the commands to a terraform script or other .sh to maintain separation of concerns
# as this is supposed to be an install docker file

# Create a swap file to relieve low memory VMs from running out of RAM
sudo fallocate -l 2G /swapfile # allocate a 2GB swap file
sudo chmod 600 /swapfile       # set owner read/write
sudo mkswap /swapfile          # mark the file as a swap file type
sudo swapon /swapfile          # enable it for use now
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab # Append swapfile config to .fstab so persists after reboot


echo "********** Starting Docker installation ****************"
chown -R $(whoami) ~/.gnupg/
chmod 700 ~/.gnupg
chmod 600 ~/.gnupg/*

# Update the apt package index
echo "********** Update apt packages ****************"
sudo apt-get update -y

# Install prerequisite packages. ca-certs are common certificates from
# certification authorities
# gnupg is free version of openpgp. Check certs and decrypt
echo "********** Install ca-certificates ****************"
sudo apt-get install \
    ca-certificates \
    curl \
    gnupg -y

# Download Docker’s official GPG key
#-f is fail fast with no output. i.e. don't return an error page or anything else
#-s silent. Don't show progress meter or error messages
#-S override the -s and show the error but leave the don't show progress meter set by -s
#-L if a response is a redirection 3xx then call again with the redirection - i.e. follow the redirection if resource has moved 
# pipe it into the new dir at /gpg after --dearmor basically converts from text to binary
echo "********** Installing GPG key ****************"
sudo mkdir -m 0755 -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --yes --dearmor -o /etc/apt/keyrings/docker.gpg


echo "********** Adding Docker GPG public key to keyring ****************"
sudo gpg --no-default-keyring --keyring /etc/apt/keyrings/docker.gpg --export | sudo tee /usr/share/keyrings/docker-archive-keyring.gpg > /dev/null

# source etc/os-release is same as ./etc/os-release i.e. run it. It sets env vars. One is VERSION_CODENAME. Currently nobel
# It sets various others too such as NAME="Ubuntu" VERSION="24.04.1 LTS (Noble Numbat)" etc
# Get the Ubuntu codename from /etc/os-release
source /etc/os-release

# Get the codename - at time of writing nobel
UBUNTU_CODENAME=${VERSION_CODENAME}

# Set up the Docker repository. In this case $(dpkg --print-architecture) evaluates to amd64
# dbkg is the debian package manager
# signed-by set to the digital signature
# download docker nobel stable in this case then add it to the list of packages pointers and signatures
echo "********** Downloading Docker ****************"
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  ${UBUNTU_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null


# Update the apt package index again with the new docker package added
sudo apt-get update -y

# Can now use apt to install the latest version of Docker Engine, CLI, and containerd
echo "********** Installing Docker ****************"
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y

# Start Docker service and enable it to start on boot
echo "********** Starting Docker ****************"
sudo timeout 30 systemctl start docker
sudo timeout 30 systemctl enable docker

# Add current user to the Docker group to manage Docker without sudo (optional, log out/in required to take effect)
echo "********** Modifying user ****************"
#sudo usermod -aG docker $USER # requires ssh to be stopped and reestablished so script won't finish so do this in terraform

# enable me as group. Comment this out if using terraform as it creates a new shell so terraform hangs
# fine if using docker manually. Alternatively, just add it manually if logged into remote
#newgrp docker # do this in terraform as terraform would be booted out of ssh when changing user 

# Verify Docker installation
sudo docker --version
sudo docker compose version

echo "Docker installation completed successfully."
