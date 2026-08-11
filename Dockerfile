# Base Node.js image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package lockfiles first to cache dependencies
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/

# Install dependencies (workspaces support)
RUN npm install

# Copy the rest of the application files
COPY . .

# Compile/Build the NestJS backend
RUN npm --prefix apps/api run build

# Expose the API server port (Hugging Face Spaces default container port is 7860)
EXPOSE 7860
ENV PORT=7860
ENV NODE_ENV=production
ENV DISABLE_QUEUES=true

# Start command
CMD ["node", "apps/api/dist/apps/api/src/main.js"]
