#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { resolve, basename, extname } from 'path';
import { layoutProcess } from './dist/index.js';

/**
 * Main function to layout a BPMN file
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node main.js <input-bpmn-file> [output-bpmn-file]');
    console.error('');
    console.error('Examples:');
    console.error('  node main.js diagram.bpmn');
    console.error('  node main.js input.bpmn output-layouted.bpmn');
    process.exit(1);
  }

  const inputFile = args[0];
  let outputFile = args[1];

  // If no output file specified, generate one based on input file
  if (!outputFile) {
    const baseName = basename(inputFile, extname(inputFile));
    const extension = extname(inputFile);
    outputFile = `${baseName}-layouted${extension}`;
  }

  try {
    console.log(`Reading BPMN file: ${inputFile}`);
    
    // Read the input BPMN file
    const inputPath = resolve(inputFile);
    const bpmnXml = readFileSync(inputPath, 'utf8');
    
    console.log('Applying auto-layout...');
    
    // Apply layout to the BPMN XML
    const layoutedXml = await layoutProcess(bpmnXml);
    
    // Write the layouted BPMN to output file
    const outputPath = resolve(outputFile);
    writeFileSync(outputPath, layoutedXml, 'utf8');
    
    console.log(`✅ Layouted BPMN saved to: ${outputFile}`);
    console.log(`📊 Original file size: ${bpmnXml.length} characters`);
    console.log(`📊 Layouted file size: ${layoutedXml.length} characters`);
    
  } catch (error) {
    console.error('❌ Error processing BPMN file:');
    
    if (error.code === 'ENOENT') {
      console.error(`File not found: ${inputFile}`);
    } else if (error.message.includes('XML')) {
      console.error('Invalid BPMN XML format');
      console.error(error.message);
    } else {
      console.error(error.message);
    }
    
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
