terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~>4.0"
    }
  }
}

provider "azurerm" {
  features {
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
  subscription_id = var.subscription_id
}

resource "azurerm_resource_group" "jokes_rg" {
  name     = var.resource_group_name
  location = var.location
}

resource "azurerm_virtual_network" "jokes_vnet" {
  name                = "jokes-vnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.jokes_rg.location
  resource_group_name = azurerm_resource_group.jokes_rg.name
}

resource "azurerm_subnet" "jokes_subnet" {
  name                 = "jokes-subnet"
  resource_group_name  = azurerm_resource_group.jokes_rg.name
  virtual_network_name = azurerm_virtual_network.jokes_vnet.name
  address_prefixes     = ["10.0.1.0/24"]
}

# ─── Kong NSG ─────────────────────────────────────────────────────────────────

resource "azurerm_network_security_group" "kong_nsg" {
  name                = "kong-nsg"
  location            = azurerm_resource_group.jokes_rg.location
  resource_group_name = azurerm_resource_group.jokes_rg.name

  security_rule {
    name                       = "allow-ssh"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "allow-http"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "allow-https"
    priority                   = 120
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "allow-kong-admin"
    priority                   = 130
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "8001"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

# ─── Services NSG ─────────────────────────────────────────────────────────────

resource "azurerm_network_security_group" "services_nsg" {
  name                = "services-nsg"
  location            = azurerm_resource_group.jokes_rg.location
  resource_group_name = azurerm_resource_group.jokes_rg.name

  security_rule {
    name                       = "allow-ssh"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "allow-joke-service"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "4000"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "allow-submit-service"
    priority                   = 120
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "4200"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "allow-rabbitmq-management"
    priority                   = 130
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "15672"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "allow-moderate-service"
    priority                   = 140
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "4300"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

# ─── Kong VM ──────────────────────────────────────────────────────────────────

resource "azurerm_public_ip" "kong_pip" {
  name                = "kong-pip"
  location            = azurerm_resource_group.jokes_rg.location
  resource_group_name = azurerm_resource_group.jokes_rg.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_network_interface" "kong_nic" {
  name                = "kong-nic"
  location            = azurerm_resource_group.jokes_rg.location
  resource_group_name = azurerm_resource_group.jokes_rg.name

  ip_configuration {
    name                          = "kong-ip-config"
    subnet_id                     = azurerm_subnet.jokes_subnet.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.kong_pip.id
  }
}

resource "azurerm_network_interface_security_group_association" "kong_nic_nsg" {
  network_interface_id      = azurerm_network_interface.kong_nic.id
  network_security_group_id = azurerm_network_security_group.kong_nsg.id
}

resource "azurerm_linux_virtual_machine" "kong_vm" {
  name                            = "kong-vm"
  location                        = azurerm_resource_group.jokes_rg.location
  resource_group_name             = azurerm_resource_group.jokes_rg.name
  size                            = var.vm_size
  admin_username                  = var.admin_username
  admin_password                  = var.admin_password
  disable_password_authentication = false
  network_interface_ids           = [azurerm_network_interface.kong_nic.id]

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts"
    version   = "latest"
  }

  connection {
    type     = "ssh"
    host     = azurerm_public_ip.kong_pip.ip_address
    user     = var.admin_username
    password = var.admin_password
  }

  provisioner "file" {
    source      = "../kong/docker-az-tf-swap.sh"
    destination = "/home/${var.admin_username}/docker-az-tf-swap.sh"
  }

  provisioner "file" {
    source      = "../kong/kong.yaml"
    destination = "/home/${var.admin_username}/kong.yaml"
  }

  provisioner "file" {
    source      = "../kong/server.crt"
    destination = "/home/${var.admin_username}/server.crt"
  }

  provisioner "file" {
    source      = "../kong/server.key"
    destination = "/home/${var.admin_username}/server.key"
  }

  provisioner "remote-exec" {
    inline = [
      "chmod +x /home/${var.admin_username}/docker-az-tf-swap.sh",
      "sudo /home/${var.admin_username}/docker-az-tf-swap.sh",
      "sudo mkdir -p /etc/kong/certs",
      "sudo mv /home/${var.admin_username}/kong.yaml /etc/kong/kong.yaml",
      "sudo mv /home/${var.admin_username}/server.crt /etc/kong/certs/server.crt",
      "sudo mv /home/${var.admin_username}/server.key /etc/kong/certs/server.key",
      "sudo docker run -d --name kong --restart unless-stopped -p 80:8000 -p 443:8443 -p 8001:8001 -v /etc/kong/kong.yaml:/etc/kong/kong.yaml:ro -v /etc/kong/certs/server.crt:/etc/kong/certs/server.crt:ro -v /etc/kong/certs/server.key:/etc/kong/certs/server.key:ro -e KONG_DATABASE=off -e KONG_DECLARATIVE_CONFIG=/etc/kong/kong.yaml -e KONG_PROXY_LISTEN='0.0.0.0:8000, 0.0.0.0:8443 ssl' -e KONG_ADMIN_LISTEN='0.0.0.0:8001' -e KONG_SSL_CERT=/etc/kong/certs/server.crt -e KONG_SSL_CERT_KEY=/etc/kong/certs/server.key kong:3.6"
    ]
  }
}

# ─── Joke VM (joke app + database + ETL) ──────────────────────────────────────

resource "azurerm_network_interface" "joke_nic" {
  name                = "joke-nic"
  location            = azurerm_resource_group.jokes_rg.location
  resource_group_name = azurerm_resource_group.jokes_rg.name

  ip_configuration {
    name                          = "joke-ip-config"
    subnet_id                     = azurerm_subnet.jokes_subnet.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.1.10"
  }
}

resource "azurerm_network_interface_security_group_association" "joke_nic_nsg" {
  network_interface_id      = azurerm_network_interface.joke_nic.id
  network_security_group_id = azurerm_network_security_group.services_nsg.id
}

resource "azurerm_linux_virtual_machine" "joke_vm" {
  name                            = "joke-vm"
  location                        = azurerm_resource_group.jokes_rg.location
  resource_group_name             = azurerm_resource_group.jokes_rg.name
  size                            = var.vm_size
  admin_username                  = var.admin_username
  admin_password                  = var.admin_password
  disable_password_authentication = false
  network_interface_ids           = [azurerm_network_interface.joke_nic.id]

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts"
    version   = "latest"
  }

  connection {
    type                = "ssh"
    host                = "10.0.1.10"
    user                = var.admin_username
    password            = var.admin_password
    bastion_host        = azurerm_public_ip.kong_pip.ip_address
    bastion_user        = var.admin_username
    bastion_password    = var.admin_password
  }

  provisioner "file" {
    source      = "../kong/docker-az-tf-swap.sh"
    destination = "/home/${var.admin_username}/docker-az-tf-swap.sh"
  }

  provisioner "file" {
    source      = "../compose-joke.yaml"
    destination = "/home/${var.admin_username}/compose.yaml"
  }

  provisioner "file" {
    source      = "../.env"
    destination = "/home/${var.admin_username}/.env"
  }

  provisioner "file" {
    source      = "../dbinit"
    destination = "/home/${var.admin_username}/dbinit"
  }

  provisioner "file" {
    source      = "../jokes"
    destination = "/home/${var.admin_username}/jokes"
  }

  provisioner "file" {
    source      = "../etl"
    destination = "/home/${var.admin_username}/etl"
  }

  provisioner "remote-exec" {
    inline = [
      "chmod +x /home/${var.admin_username}/docker-az-tf-swap.sh",
      "sudo /home/${var.admin_username}/docker-az-tf-swap.sh",
      "cd /home/${var.admin_username} && sudo docker compose --profile mongo up -d --build"
    ]
  }
}

# ─── Submit VM (RabbitMQ + submit app + moderate app) ─────────────────────────

resource "azurerm_network_interface" "submit_nic" {
  name                = "submit-nic"
  location            = azurerm_resource_group.jokes_rg.location
  resource_group_name = azurerm_resource_group.jokes_rg.name

  ip_configuration {
    name                          = "submit-ip-config"
    subnet_id                     = azurerm_subnet.jokes_subnet.id
    private_ip_address_allocation = "Static"
    private_ip_address            = "10.0.1.11"
  }
}

resource "azurerm_network_interface_security_group_association" "submit_nic_nsg" {
  network_interface_id      = azurerm_network_interface.submit_nic.id
  network_security_group_id = azurerm_network_security_group.services_nsg.id
}

resource "azurerm_linux_virtual_machine" "submit_vm" {
  name                            = "submit-vm"
  location                        = azurerm_resource_group.jokes_rg.location
  resource_group_name             = azurerm_resource_group.jokes_rg.name
  size                            = var.vm_size
  admin_username                  = var.admin_username
  admin_password                  = var.admin_password
  disable_password_authentication = false
  network_interface_ids           = [azurerm_network_interface.submit_nic.id]

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts"
    version   = "latest"
  }

  connection {
    type                = "ssh"
    host                = "10.0.1.11"
    user                = var.admin_username
    password            = var.admin_password
    bastion_host        = azurerm_public_ip.kong_pip.ip_address
    bastion_user        = var.admin_username
    bastion_password    = var.admin_password
  }

  provisioner "file" {
    source      = "../kong/docker-az-tf-swap.sh"
    destination = "/home/${var.admin_username}/docker-az-tf-swap.sh"
  }

  provisioner "file" {
    source      = "../compose-submit.yaml"
    destination = "/home/${var.admin_username}/compose.yaml"
  }

  provisioner "file" {
    source      = "../.env"
    destination = "/home/${var.admin_username}/.env"
  }

  provisioner "file" {
    source      = "../submit"
    destination = "/home/${var.admin_username}/submit"
  }

  provisioner "file" {
    source      = "../moderate"
    destination = "/home/${var.admin_username}/moderate"
  }

  provisioner "remote-exec" {
    inline = [
      "chmod +x /home/${var.admin_username}/docker-az-tf-swap.sh",
      "sudo /home/${var.admin_username}/docker-az-tf-swap.sh",
      "cd /home/${var.admin_username} && sudo docker compose up -d --build"
    ]
  }
}

# ─── Outputs ──────────────────────────────────────────────────────────────────

output "kong_public_ip" {
  value = azurerm_public_ip.kong_pip.ip_address
}
