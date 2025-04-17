# ShipKit - shadcn/ui Installation Preview PRD

## Overview

ShipKit's shadcn/ui Installation Preview is a web-based tool that allows users to experiment with shadcn/ui component installation in a sandboxed environment. This feature enables users to see exactly what files would be created or modified when installing shadcn/ui components without affecting their actual codebase.

## Problem Statement

Adding UI components to a Next.js project often requires making changes to multiple configuration files and creating component files. This process can be intimidating for developers who are concerned about:

1. Breaking their existing project configuration
2. Understanding exactly what files will be modified
3. Visualizing the resulting component code before committing to the changes

The current process requires users to either commit to installing components in their project or manually review documentation, neither of which provides an accurate preview of the changes.

## Goals

1. Provide a zero-risk way to preview shadcn/ui component installation
2. Show users exactly which files will be created or modified
3. Enable users to understand the structure and styling of shadcn/ui components
4. Create a seamless, browser-based experience that doesn't require local environment setup
5. Offer the option to download or apply changes directly to their project

## Non-Goals

1. Providing a full development environment
2. Supporting complex project structures beyond standard Next.js layouts
3. Allowing modification of component code in the preview environment
4. Supporting frameworks other than Next.js

## Technical Approach

The installation preview uses WebContainers to create an isolated, browser-based Node.js environment. Key components include:

1. **WebContainer Environment**: A virtualized container running in the browser
2. **File System Management**: Importing essential project files and tracking changes
3. **Command Execution**: Running shadcn/ui commands and capturing their output
4. **Diff Generation**: Showing users exactly what files changed and how
5. **File Export**: Allowing users to download modified files for manual integration

## User Experience

The user interacts with a simple web interface that:

1. Automatically initializes a WebContainer environment
2. Allows specifying which shadcn/ui component to install
3. Shows real-time terminal output during command execution
4. Presents a clear list of changed files with syntax-highlighted diffs
5. Provides download options for the resulting files

## Key Features

1. **Browser-Based Installation**: Run shadcn/ui commands entirely in the browser
2. **File Comparison**: View before/after differences for all modified files
3. **Terminal Output**: See the actual command execution process
4. **Project Structure Support**: Compatible with both `app/` and `src/app/` directory structures
5. **File Export**: Save or download changed files for integration into your project
6. **GitHub Integration**: Optional direct PR creation for projects connected to GitHub

## Technical Requirements

1. Cross-origin isolation for WebContainer support
2. Browser capabilities for SharedArrayBuffer and Service Workers
3. Memory optimizations to handle larger component installations
4. Error handling for compatibility issues and command failures
5. Efficient file system snapshot capture and comparison

## Success Metrics

1. Reduction in shadcn/ui installation issues reported
2. Increase in component adoption and customization
3. User satisfaction with the preview experience
4. Successful component installations following preview usage
5. Reduced support requests related to component installation

## Future Enhancements

1. Support for theme customization preview
2. Multi-component batch installation
3. Component customization within the preview environment
4. Integration with other UI component libraries
5. Local CLI option for environments where WebContainer is not supported
