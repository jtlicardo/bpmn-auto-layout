# BPMN Auto-Layout CLI Tool

This `main.js` script provides a command-line interface for the BPMN auto-layout library. It allows you to process unlayouted BPMN files and generate layouted versions with proper positioning and layout information.

## Prerequisites

Make sure you have installed the dependencies:

```bash
npm install
```

**Note:** If you manually edit the bpmn-auto-layout library files, you'll need to rerun `npm install` to ensure the changes are properly integrated.

## Usage

### Basic Usage
```bash
node main.js <input-bpmn-file>
```

This will create a layouted version of your BPMN file with the suffix `-layouted` added to the filename.

**Example:**
```bash
node main.js diagram.bpmn
# Creates: diagram-layouted.bpmn
```

### Custom Output File
```bash
node main.js <input-bpmn-file> <output-bpmn-file>
```

**Example:**
```bash
node main.js input.bpmn my-layouted-diagram.bpmn
```

## Features

- ✅ Reads BPMN XML files from disk
- ✅ Applies automatic layout using the bpmn-auto-layout library
- ✅ Saves the layouted BPMN to a new file
- ✅ Provides helpful error messages
- ✅ Shows file size comparison
- ✅ Supports custom output filenames

## Error Handling

The script handles various error scenarios:
- File not found
- Invalid BPMN XML format
- Permission errors
- Other unexpected errors

## Examples

```bash
# Layout a simple BPMN file
node main.js process.bpmn

# Layout with custom output name
node main.js complex-process.bpmn layouted-process.bpmn

# Test with the included fixtures
node main.js test/fixtures/scenario.simple.bpmn
```

## What the Layout Process Does

The auto-layout process:
- Analyzes the BPMN process structure
- Generates missing diagram interchange (DI) information
- Positions elements in a logical flow
- Adds proper spacing and alignment
- Creates connection points for sequence flows

Note: The original BPMN file remains unchanged; a new file is created with the layout information.
