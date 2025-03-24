# shadcn/UI Template Installer

This directory contains the code for the shadcn/UI Template Installer, which allows users to easily add shadcn/UI components and configuration to their ShipKit projects.

## How It Works

1. User selects to install the shadcn/UI template
2. The installer uses WebContainers to run the shadcn CLI in the browser
3. The generated files are presented to the user for preview
4. User can download the files individually or as a ZIP file
5. Files can be added to the project to incorporate the shadcn/UI components

## Directory Structure

- `page.tsx`: Main page component with UI for the installer
- `actions.ts`: Server actions for processing the template
- `container-utils.ts`: WebContainer utilities for running shadcn
- `utils.ts`: Client-side utility functions
- `services.ts`: Server-side utility functions
- `layout.tsx`: Layout component for the install page
- `components/`: UI components specific to the installer
  - `container-processor.tsx`: Handles WebContainer processing
  - `file-preview.tsx`: Component for previewing generated files

## Technologies Used

- WebContainers: For running Node.js and the shadcn CLI in the browser
- Next.js Server Actions: For processing and optimizing files
- Shadcn/UI: For the user interface components
- JSZip: For generating downloadable ZIP files

## Usage

Navigate to `/install` to use the installer. The installer will automatically detect the project structure (app/ vs src/app/) and adjust the file paths accordingly.

## Technical Implementation

The installer uses the following process:

1. Initialize a WebContainer in the browser
2. Install the shadcn CLI within the container
4. Process and transform the files to match the project structure
5. Present the files to the user for preview and download

This approach allows the installer to work entirely in the browser without needing to run CLI commands locally, making it more accessible for users who may not have Node.js installed.
