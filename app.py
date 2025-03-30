import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from anthropic import Anthropic

# Initialize FastAPI app
app = FastAPI(
    title="Amazon Review Framework API",
    description="API for accessing Amazon Review Framework components",
    version="2.0.0",
)

# Enable CORS for API access from any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directory containing framework files
FRAMEWORK_DIR = "NEW-SYSTEM"

# Serve static files directly
app.mount("/files", StaticFiles(directory=FRAMEWORK_DIR), name="files")

# Define request model for review generation
class ReviewRequest(BaseModel):
    product_name: str
    product_category: str
    user_experience: str
    include_components: list[str] = []

# Define response model
class ReviewResponse(BaseModel):
    review: str

# Root endpoint
@app.get("/")
def read_root():
    return {
        "message": "Amazon Review Framework API",
        "endpoints": [
            "/api/files",
            "/api/files/{filename}",
            "/api/framework"
        ],
        "static_files": "/files/{filename}"
    }

# List all framework files
@app.get("/api/files")
def list_files():
    if os.path.exists(FRAMEWORK_DIR):
        files = [f for f in os.listdir(FRAMEWORK_DIR) if f.endswith('.json')]
        return {"files": files}
    raise HTTPException(status_code=404, detail=f"Directory {FRAMEWORK_DIR} not found")

# Get a specific file
@app.get("/api/files/{filename}")
def get_file(filename: str):
    if not filename.endswith(".json"):
        filename += ".json"
    
    file_path = os.path.join(FRAMEWORK_DIR, filename)
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error loading {filename}: {str(e)}")
    raise HTTPException(status_code=404, detail=f"File {filename} not found")

# Get the complete framework
@app.get("/api/framework")
def get_framework():
    framework = {}
    if os.path.exists(FRAMEWORK_DIR):
        for filename in os.listdir(FRAMEWORK_DIR):
            if filename.endswith(".json"):
                file_path = os.path.join(FRAMEWORK_DIR, filename)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        framework[filename] = json.load(f)
                except Exception as e:
                    framework[filename] = {"error": f"Error loading {filename}: {str(e)}"}
        return framework
    raise HTTPException(status_code=404, detail=f"Directory {FRAMEWORK_DIR} not found")

# Generate review using Claude API
@app.post("/api/generate-review")
def generate_review(request: ReviewRequest):
    # Get API key from environment variable
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY environment variable not set")
    
    # Initialize Anthropic client
    client = Anthropic(api_key=api_key)
    
    # Prepare framework components to include in the prompt
    framework_components = {}
    
    # Always include core components
    core_components = [
        "framework-config.json",
        "review-strategy.json",
        "content-structure.json",
        "personality-balance.json",
        "writing-process.json"
    ]
    
    # Add user-requested components
    if request.include_components:
        core_components.extend(request.include_components)
    
    # Load the requested framework components
    for component in core_components:
        file_path = os.path.join(FRAMEWORK_DIR, component)
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    framework_components[component] = json.load(f)
            except Exception as e:
                framework_components[component] = {"error": f"Error loading {component}: {str(e)}"}
    
    # Create system prompt with framework components
    system_prompt = "You are an expert product reviewer using the Amazon Review Framework to create exceptional reviews. "
    system_prompt += "Use the following framework components to guide your review creation:\n\n"
    
    for component_name, component_data in framework_components.items():
        system_prompt += f"# {component_name}\n"
        system_prompt += json.dumps(component_data, indent=2)
        system_prompt += "\n\n"
    
    # Create user prompt with product information
    user_prompt = f"""
    I need to write an Amazon review for this product: {request.product_name} (category: {request.product_category}).
    
    Here's my experience with the product:
    {request.user_experience}
    
    Please create a complete, well-structured review following the framework guidelines. 
    Use the writing-process.json workflow and structure the review according to content-structure.json.
    Balance information and personality as specified in personality-balance.json.
    The review should be authentic, engaging, and helpful for potential buyers.
    
    Format the review with proper section headers, and follow all guidelines for an exceptional review.
    """
    
    try:
        # Call Claude API
        response = client.messages.create(
            model="claude-3-opus-20240229",
            system=system_prompt,
            max_tokens=4000,
            messages=[
                {"role": "user", "content": user_prompt}
            ]
        )
        
        # Return the generated review
        return ReviewResponse(review=response.content[0].text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating review: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=7860)curl -X POST http://localhost:8000/api/generate-review \
  -H "Content-Type: application/json" \
  -d '{
    "product_name": "Glass Measuring Cup Set",
    "product_category": "Kitchen",
    "user_experience": "I bought these glass measuring cups last month. They are perfect for measuring small amounts for coffee brewing. One broke when I dropped it on my hardwood floor, but the other has been very durable."
  }'