
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import uvicorn
import os
import io
from google.cloud import vision
import json


app = FastAPI()

# Allow CORS for local dev/mobile
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Dummy product list (replace with DB or API call)
PRODUCTS = [
    {"product_id": "1", "name": "Blue Pen", "image_url": "https://example.com/pen.jpg"},
    {"product_id": "2", "name": "Notebook", "image_url": "https://example.com/notebook.jpg"},
    {"product_id": "3", "name": "Stapler", "image_url": "https://example.com/stapler.jpg"},
    {"product_id": "4", "name": "USB Cable", "image_url": "https://example.com/usb.jpg"},
    {"product_id": "5", "name": "Marker", "image_url": "https://example.com/marker.jpg"},
]

def match_products(labels: List[str], products: List[dict], top_k=3):
    results = []
    for product in products:
        score = 0
        pname = product["name"].lower()
        for label in labels:
            if label.lower() in pname:
                score += 1
        if score > 0:
            results.append({"product_id": product["product_id"], "name": product["name"], "score": score, "image_url": product["image_url"]})
    results.sort(key=lambda x: -x["score"])
    return results[:top_k]

@app.post("/search-by-image")
async def search_by_image(file: UploadFile = File(...)):
    # Read image bytes
    image_bytes = await file.read()
    client = vision.ImageAnnotatorClient()
    image = vision.Image(content=image_bytes)
    response = client.label_detection(image=image)
    labels = [label.description for label in response.label_annotations]
    # Match labels to products
    matches = match_products(labels, PRODUCTS)
    return {"matches": matches, "labels": labels}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
