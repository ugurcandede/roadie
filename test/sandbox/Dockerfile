# Minimal sshd sandbox for integration testing of roadie configs.
# Single user "deploy" with NOPASSWD sudo, key-only auth, no root login.
FROM alpine:3.20

RUN apk add --no-cache openssh sudo bash coreutils && \
    ssh-keygen -A && \
    adduser -D -s /bin/bash deploy && \
    passwd -d deploy && \
    echo "deploy ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers && \
    mkdir -p /home/deploy/.ssh && \
    chown deploy:deploy /home/deploy/.ssh && \
    chmod 700 /home/deploy/.ssh && \
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && \
    sed -i 's/#PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config && \
    sed -i 's/#PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config

# authorized_keys is provided at build time (setup.js writes it next to Dockerfile).
COPY authorized_keys /home/deploy/.ssh/authorized_keys
RUN chown deploy:deploy /home/deploy/.ssh/authorized_keys && \
    chmod 600 /home/deploy/.ssh/authorized_keys

EXPOSE 22
CMD ["/usr/sbin/sshd", "-D", "-e"]
