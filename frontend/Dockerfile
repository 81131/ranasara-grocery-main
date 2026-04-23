# frontend/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
# (Ensure you have run `npm create vite@latest .` or similar in the frontend folder first)
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the frontend code
COPY . .

# Standard dev command for Vite/Create React App
CMD ["npm", "run", "dev"]