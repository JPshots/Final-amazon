// config.js - Configuration for Amazon Review Framework

const CLAUDE_CONFIG = {
    // Model settings for optimal creativity in framework-based reviews
    model: "claude-3-7-sonnet-20240229", // Using Claude 3.7 Sonnet
    temperature: 0.85,                   // Higher temperature for creative sections
    max_tokens: 4000,                    // Allow for longer, detailed responses
    
    // Advanced parameters (if supported by the API endpoint)
    top_p: 0.93,                         // Allow broader vocabulary choices
    top_k: 60,                           // Consider a wide range of token options
  };
  
  // Framework file locations - using YAML instead of JSON
  const FRAMEWORK_PATHS = {
    base_directory: "./YAML/",
    framework_files: [
      "README.md",
      "review-strategy.yaml",
      "question-framework.yaml", 
      "personality-balance.yaml",
      "creative-techniques.yaml",
      "content-structure.yaml",
      "formatting-and-style.yaml",
      "keyword-strategy.yaml",
      "quality-control.yaml",
      "writing-process.yaml"
    ],
    images_directory: "./images/"
  };
  
  // Add this function first (before loadFrameworkFiles)
async function cleanupYamlFile(filePath) {
  const fs = require('fs').promises;
  try {
    let content = await fs.readFile(filePath, 'utf8');
    
    // Fix common YAML indentation issues
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      // Log problematic lines near the error (for debugging)
      if (i >= 60 && i <= 70) {
        console.log(`Line ${i+1}: "${lines[i]}"`);
      }
    }
    
    console.log(`Attempting to load file despite errors: ${filePath}`);
    return content;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
}

// Then the updated loadFrameworkFiles function
async function loadFrameworkFiles() {
  const yaml = require('js-yaml');
  const fs = require('fs').promises;
  const path = require('path');
  
  const frameworkContent = {};
  
  try {
    for (const file of FRAMEWORK_PATHS.framework_files) {
      const filePath = path.join(FRAMEWORK_PATHS.base_directory, file);
      let content;
      
      if (file.endsWith('.yaml')) {
        try {
          // Load and parse YAML files
          const yamlContent = await fs.readFile(filePath, 'utf8');
          content = yaml.load(yamlContent);
        } catch (yamlError) {
          console.error(`YAML error in file ${file}:`, yamlError.message);
          console.log(`Attempting to load ${file} as raw text instead...`);
          
          // Fall back to raw text if YAML parsing fails
          const rawContent = await cleanupYamlFile(filePath);
          content = rawContent; // Store as raw text
        }
      } else {
        // Handle markdown or other files as text
        content = await fs.readFile(filePath, 'utf8');
      }
      
      frameworkContent[file] = content;
    }
    return frameworkContent;
  } catch (error) {
    console.error("Error loading framework files:", error);
    throw error;
  }
}
  
  // Function to load images from the images directory
  async function loadImages() {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const files = await fs.readdir(FRAMEWORK_PATHS.images_directory);
      const imageFiles = files.filter(file => 
        /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file)
      );
      
      const images = [];
      for (const file of imageFiles) {
        const filePath = path.join(FRAMEWORK_PATHS.images_directory, file);
        const fileData = await fs.readFile(filePath);
        const base64Data = fileData.toString('base64');
        const mimeType = `image/${path.extname(file).substring(1)}`.replace('jpg', 'jpeg');
        
        images.push({
          name: file,
          data: `data:${mimeType};base64,${base64Data}`
        });
      }
      
      return images;
    } catch (error) {
      console.error("Error loading images:", error);
      return [];
    }
  }
  
  // Create a prompt that includes the framework context and images
  async function createFrameworkPrompt(userInput) {
    const framework = await loadFrameworkFiles();
    const images = await loadImages();
    
    // Combine framework files into a comprehensive context
    let frameworkContext = "# Amazon Review Framework\n\n";
    
    // Add README first for overview
    if (framework["README.md"]) {
      frameworkContext += "## Framework Overview\n" + framework["README.md"] + "\n\n";
    }
    
    // Add each YAML file with appropriate section headers
    for (const file in framework) {
      if (file === "README.md") continue; // Skip README as it's already added
      
      const fileName = file.replace('.yaml', '');
      frameworkContext += `## ${fileName}\n`;
      
      if (typeof framework[file] === 'object') {
        // For parsed YAML objects, convert back to string for the prompt
        frameworkContext += "```yaml\n" + yaml.dump(framework[file]) + "```\n\n";
      } else {
        // For text content
        frameworkContext += framework[file] + "\n\n";
      }
    }
    
    // Create the full prompt with user input
    const prompt = `
  You are implementing the Amazon Review Framework to create exceptional product reviews.
  The framework is detailed below for your reference.
  
  ${frameworkContext}
  
  USER PRODUCT EXPERIENCE:
  ${userInput}
  
  First, carefully ingest and process the base review provided by the user along with any product images in the images folder. Analyze these images for additional context about the product's appearance, features, size, and other relevant details.
  
  Then follow the exact workflow from the framework:
  1. Ask strategic questions based on question_framework.yaml to gather complete information
  2. Once you have sufficient information, create a structured review following the framework guidelines
  3. Pay particular attention to the personality-balance requirements (55% information, 40% personality, 5% flexibility)
  4. Use the creative techniques where appropriate in the designated sections
  5. Format the review according to the formatting-and-style guidelines
  
  Create a review that transforms the user's experience into an engaging, helpful product review that would qualify for the Amazon Vine program.
  `;
  
    return { prompt, images };
  }
  
  // Function to make API call to Claude with web search enabled
  async function generateReview(userInput) {
    const { Anthropic } = require('@anthropic-ai/sdk');
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    const { prompt, images } = await createFrameworkPrompt(userInput);
    
    try {
      // Prepare images for the message
      const imageContents = images.map(image => ({
        type: "image",
        source: {
          type: "base64",
          media_type: image.data.split(';')[0].slice(5),
          data: image.data.split(',')[1]
        }
      }));
      
      // Combine text and images
      const content = [
        { type: "text", text: prompt }
      ];
      
      // Add images if any exist
      if (imageContents.length > 0) {
        content.push(...imageContents);
      }
      
      const response = await client.messages.create({
        model: CLAUDE_CONFIG.model,
        max_tokens: CLAUDE_CONFIG.max_tokens,
        temperature: CLAUDE_CONFIG.temperature,
        top_p: CLAUDE_CONFIG.top_p,
        top_k: CLAUDE_CONFIG.top_k,
        system: "You are an expert in creating exceptional product reviews following the Amazon Review Framework. You can also use web search when necessary to find additional information about products or topics mentioned.",
        messages: [
          { role: "user", content: content }
        ],
        tools: [{ name: "web_search" }]
      });
      
      return response.content[0].text;
    } catch (error) {
      console.error("Error generating review:", error);
      throw error;
    }
  }
  
  module.exports = {
    CLAUDE_CONFIG,
    FRAMEWORK_PATHS,
    loadFrameworkFiles,
    loadImages,
    createFrameworkPrompt,
    generateReview
  };