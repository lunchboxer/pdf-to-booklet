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
  if (options.debug) {
    console.info('Running in debug mode')
    console.info('options:', options)
    console.info(`Input PDF has ${pageCount} pages`)
    console.info(`Output PDF will have ${finalPageCount} pages`)
    console.info('Analyzing first page')
    console.info(`First page size: ${origWidth} x ${origHeight}`)
  }

  // Define the output page size (A4 landscape)
  const [outputWidth, outputHeight] = options.useA3
    ? PageSizes.A3.reverse()
    : PageSizes.A4.reverse()
  if (options.useA3 && options.debug) {
    console.info('Using A3 size')
  }

  // Calculate scaling factor
  const padding = options.padding || 0
  const scaleX = (outputWidth / 2 - padding * 2) / origWidth
  const scaleY = options.double
    ? (outputHeight / 2 - padding * 2) / origHeight
    : (outputHeight - padding * 2) / origHeight
  const scale = Math.min(scaleX, scaleY)

  if (options.debug) {
    console.info(`Output page size: ${outputWidth} × ${outputHeight}`)
    console.info(`Padding: ${padding}`)
    console.info(`Scaling factor: ${scale}`)
  }

  // Helper function to add a page to the output PDF
  async function addPageToOutput(pageNumber, x, y) {
    if (options.debug) {
      console.info(`Adding page ${pageNumber + 1} to output at (${x}, ${y})`)
    }
    if (pageNumber < pageCount) {
      const [embeddedPage] = await outputPdf.embedPdf(inputPdf, [pageNumber])
      return {
        x: x + padding,
        y: y + padding,
        width: origWidth * scale,
        height: origHeight * scale,
        page: embeddedPage,
      }
    }
  }

  if (options.debug && options.double) {
    console.info('Double printing enabled')
  }

  for (let index = 0; index < finalPageCount / 2; index += 2) {
    const outputPage = outputPdf.addPage([outputWidth, outputHeight])

    // Back side (even page number)
    const backLeftBottom = await addPageToOutput(
      finalPageCount - 1 - index,
      0,
      0,
    )
    const backRightBottom = await addPageToOutput(index, outputWidth / 2, 0)

    if (backLeftBottom) {
      outputPage.drawPage(backLeftBottom.page, backLeftBottom)
      if (options.double) {
        const backLeftTop = { ...backLeftBottom, y: outputHeight / 2 + padding }
        outputPage.drawPage(backLeftBottom.page, backLeftTop)
      }
    }
    if (backRightBottom) {
      outputPage.drawPage(backRightBottom.page, backRightBottom)
      if (options.double) {
        const backRightTop = {
          ...backRightBottom,
          y: outputHeight / 2 + padding,
        }
        outputPage.drawPage(backRightBottom.page, backRightTop)
      }
    }

    // Front side (odd page number)
    const frontPage = outputPdf.addPage([outputWidth, outputHeight])

    const frontLeftBottom = await addPageToOutput(index + 1, 0, 0)
    const frontRightBottom = await addPageToOutput(
      finalPageCount - 2 - index,
      outputWidth / 2,
      0,
    )

    if (frontLeftBottom) {
      frontPage.drawPage(frontLeftBottom.page, frontLeftBottom)
      if (options.double) {
        const frontLeftTop = {
          ...frontLeftBottom,
          y: outputHeight / 2 + padding,
        }
        frontPage.drawPage(frontLeftBottom.page, frontLeftTop)
      }
    }
    if (frontRightBottom) {
      frontPage.drawPage(frontRightBottom.page, frontRightBottom)
      if (options.double) {
        const frontRightTop = {
          ...frontRightBottom,
          y: outputHeight / 2 + padding,
        }
        frontPage.drawPage(frontRightBottom.page, frontRightTop)
      }
    }

    if (options.debug) {
      console.info(`Completed page ${index + 1} of ${finalPageCount / 2}`)
    }
  }

  // Save the output PDF
  const pdfBytes = await outputPdf.save()
  writeFileSync(outputPath, pdfBytes)
}

async function processBatch(inputDirectory, outputDirectory, options) {
  if (options.debug) {
    console.info(`Processing batch of PDF files in ${inputDirectory}`)
    console.info(`Output directory: ${outputDirectory}`)
  }
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
  debug: arguments_.includes('--debug'),
  double: arguments_.includes('--double'),
  padding: 0,
}

const paddingIndex = arguments_.indexOf('--padding')
if (paddingIndex !== -1 && paddingIndex < arguments_.length - 1) {
  options.padding = Number.parseFloat(arguments_[paddingIndex + 1])
}

if (!(inputPath && outputPath)) {
  console.info(
    'Usage: node script.js <input_path> <output_path> [--a3] [--debug] [--double] [--padding <padding>]',
  )
  console.info('  <input_path>: Path to input PDF file or directory')
  console.info(
    '  <output_path>: Path to output PDF file or directory (for batch mode)',
  )
  console.info('  --a3: Use A3 size instead of A4')
  console.info('  --debug: Enable additional logging')
  console.info('  --double: print two of each page')
  console.info('  --padding: Padding between pages in points (default: 0)')
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
