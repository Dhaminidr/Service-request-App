# Stage 1: The Build Stage
# Use a Node.js base image
FROM node:22-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json first
COPY package*.json ./

# **Crucial Step: Set Build-Time Environment Variables**
# This makes the variables available for npm ci/install scripts
ARG ADMIN_EMAIL
ARG EMAIL_PASS
ARG EMAIL_SERVICE
ARG EMAIL_USER
ARG JWT_SECRET

# Run the install command using the ARG variables
RUN ADMIN_EMAIL=$ADMIN_EMAIL \
    EMAIL_PASS=$EMAIL_PASS \
    EMAIL_SERVICE=$EMAIL_SERVICE \
    EMAIL_USER=$EMAIL_USER \
    JWT_SECRET=$JWT_SECRET \
    npm ci --omit=dev

# Copy the rest of your application code
COPY . .

# Run your production build script if you have one (e.g., for Next.js)
# If your app is just a server (no compilation), you can skip this line:
# RUN npm run build

# Stage 2: The Final Production Image
# Use a smaller, secure base image for runtime
FROM node:22-alpine AS production

# Set the working directory
WORKDIR /app

# Copy only the necessary files from the builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app ./

# Set the default port for the application
ENV PORT 3000

# Tell the container how to start the app
CMD [ "node", "index.js" ]