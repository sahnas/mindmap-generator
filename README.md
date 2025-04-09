# Mind Map Generator

AI-Generated Mind Maps using OpenAI API and GCP Storage.

## Overview

This project is a backend service that generates mind maps using OpenAI's GPT-3.5-Turbo API based on input CSV data. The generated mind maps are stored in Google Cloud Storage and the results are tracked in an output CSV file.

## Features

- Reads input CSV with subject and topic data
- Generates mind maps using OpenAI API
- Stores mind maps in Google Cloud Storage
- Writes results to output CSV
- Provides API to access generated mind maps
- Command-line script for batch processing

## Tech Stack

- Node.js (v22+)
- TypeScript
- Fastify (backend framework)
- OpenAI API (GPT-3.5-Turbo)
- Google Cloud Storage
- CSV parsing with fast-csv

## Project Structure

```bash
.
├── data/                  # Directory for input/output CSV files
├── src/
│   ├── index.ts           # Application entry point
│   ├── server.ts          # Fastify server setup
│   ├── plugins/           # Fastify plugins
│   ├── routes/            # API routes
│   ├── schemas/           # API schemas for validation
│   ├── services/          # Business logic services
│   └── types/             # TypeScript type definitions
├── tests/                 # Test files
├── .env                   # Environment variables
├── package.json           # Project dependencies
└── tsconfig.json          # TypeScript configuration
```

## Setup

### Prerequisites

- Node.js v22+
- A Google Cloud Platform account with a project
- OpenAI API key

### Environment Variables

Create a `.env` file in the root of the project with the following variables:

```bash
# OpenAI API
OPENAI_API_KEY=your_openai_api_key

# GCP Configuration
GCP_PROJECT_ID=your_gcp_project_id
GCP_BUCKET_NAME=mindmaps-storage

# Application settings
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Input/Output files
INPUT_CSV_PATH=./data/input_context_v2.csv
OUTPUT_CSV_PATH=./data/output_results.csv
```

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## API Endpoints

### GET /api/mindmaps

Retrieves all generated mind maps.

#### Response Format

```json
{
  "mindMaps": [
    {
      "id": "uuid",
      "subject": "Mathematics",
      "topic": "Algebra",
      "root": {
        "id": "uuid",
        "text": "Algebra",
        "children": [
          {
            "id": "uuid",
            "text": "Equations",
            "children": [...]
          },
          ...
        ]
      },
      "createdAt": "2025-04-09T12:34:56.789Z"
    },
    ...
  ]
}
```

### POST /api/mindmaps/generate

Generates mind maps from the input CSV and stores them in GCP.

#### Request Body (Optional)

```json
{
  "inputCsvPath": "./data/custom_input.csv",
  "outputCsvPath": "./data/custom_output.csv"
}
```

#### Response

```json
{
  "results": [
    {
      "topic": "Algebra",
      "status": "Success"
    },
    {
      "topic": "Geometry",
      "status": "Failure",
      "error": "Error message"
    },
    ...
  ]
}
```

This will read the input CSV, generate mind maps, store them in GCP, and write the results to the output CSV.

## Docker

Build a Docker image:

```bash
npm run build:docker:prod
```

Run the Docker container:

```bash
docker run -p 3000:3000 --env-file .env mindmap-generator
```

## Testing

Run tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

## Mind Map Data Structure

The mind maps are stored in the following JSON structure:

```json
{
  "id": "uuid",
  "subject": "Subject name",
  "topic": "Topic name",
  "root": {
    "id": "uuid",
    "text": "Main topic",
    "children": [
      {
        "id": "uuid",
        "text": "Subtopic 1",
        "children": [
          {
            "id": "uuid",
            "text": "Detail 1"
          },
          {
            "id": "uuid",
            "text": "Detail 2"
          }
        ]
      },
      {
        "id": "uuid",
        "text": "Subtopic 2",
        "children": [...]
      }
    ]
  },
  "createdAt": "ISO date string"
}
```

## License

MIT
