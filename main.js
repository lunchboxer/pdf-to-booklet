#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import nodePath from 'node:path'
import { PDFDocument, PageSizes } from 'pdf-lib'

async function pdfToBooklet(inputPath, outputPath, options) {
  // Read the input PDF
  const inputPdfBytes = readFileSync(inputPath)
  const inputPdf = await PDFDocument.load(inputPdfBytes)
  const outputPdf = await PDFDocument.create()

  const pageCount = inputPdf.getPageCount()
  const finalPageCount = Math.ceil(pageCount / 4) * 4

  // Analyze the first page to determine size and orientation
  const firstPage = inputPdf.getPage(0)
  const { width: origWidth, height: origHeight } = firstPage.getSize()

  // Define the output page size (A4 landscape)
  const [outputWidth, outputHeight] = options.useA3
    ? PageSizes.A3.reverse()
    : PageSizes.A4.reverse()

  // Calculate scaling factor
  const scaleX = outputWidth / (2 * origWidth)
  const scaleY = outputHeight / origHeight
  const scale = Math.min(scaleX, scaleY)

  // Helper function to add a page to the output PDF
  async function addPageToOutput(pageNumber, x) {
    if (pageNumber < pageCount) {
      const [embeddedPage] = await outputPdf.embedPdf(inputPdf, [pageNumber])
      return {
        x,
        y: (outputHeight - origHeight * scale) / 2,
        width: origWidth * scale,
        height: origHeight * scale,
        page: embeddedPage,
      }
    }
  }

  for (let index = 0; index < finalPageCount / 2; index += 2) {
    const outputPage = outputPdf.addPage([outputWidth, outputHeight])

    // Back side (even page number)
    const backLeft = await addPageToOutput(finalPageCount - 1 - index, 0)
    const backRight = await addPageToOutput(index, outputWidth / 2)

    if (backLeft) {
      outputPage.drawPage(backLeft.page, backLeft)
    }
    if (backRight) {
      outputPage.drawPage(backRight.page, backRight)
    }

    // Front side (odd page number)
    const frontPage = outputPdf.addPage([outputWidth, outputHeight])

    const frontLeft = await addPageToOutput(index + 1, 0)
    const frontRight = await addPageToOutput(
      finalPageCount - 2 - index,
      outputWidth / 2,
    )

    if (frontLeft) {
      frontPage.drawPage(frontLeft.page, frontLeft)
    }
    if (frontRight) {
      frontPage.drawPage(frontRight.page, frontRight)
    }
  }

  // Save the output PDF
  const pdfBytes = await outputPdf.save()
  writeFileSync(outputPath, pdfBytes)
}

async function processBatch(inputDirectory, outputDirectory, options) {
  const files = readdirSync(inputDirectory)
  for (const file of files) {
    if (file.toLowerCase().endsWith('.pdf')) {
      const inputPath = nodePath.join(inputDirectory, file)
      const { name } = nodePath.parse(file)
      const outputPath = nodePath.join(outputDirectory, `${name}-booklet.pdf`)

      console.info(`Processing: ${file}`)
      await pdfToBooklet(inputPath, outputPath, options)
      console.info(`Created booklet: ${outputPath}`)
    }
  }
}

// Parse command line arguments
const arguments_ = process.argv.slice(2)
const inputPath = arguments_[0]
const outputPath = arguments_[1]
const options = {
  useA3: arguments_.includes('--a3'),
}

if (!(inputPath && outputPath)) {
  console.info('Usage: node script.js <input_path> <output_path> [--a3]')
  console.info('  <input_path>: Path to input PDF file or directory')
  console.info(
    '  <output_path>: Path to output PDF file or directory (for batch mode)',
  )
  console.info('  --a3: Use A3 size instead of A4')
  process.exit(1)
}

// Check if input is a directory (batch mode) or a file
const isInputDirectory = statSync(inputPath).isDirectory()

if (isInputDirectory) {
  if (!statSync(outputPath).isDirectory()) {
    console.error('Error: In batch mode, output path must be a directory')
    process.exit(1)
  }
  try {
    await processBatch(inputPath, outputPath, options)
    console.info('Batch processing completed successfully')
  } catch (error) {
    console.error('Error in batch processing:', error)
  }
} else {
  try {
    await pdfToBooklet(inputPath, outputPath, options)
    console.info(`Saddle-stitch booklet created successfully: ${outputPath}`)
  } catch (error) {
    console.error('Error creating booklet:', error)
  }
}
