import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Check if required environment variables are available
const requiredEnvVars = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.warn('Missing Cloudinary environment variables:', missingEnvVars);
  console.warn('Cloudinary image deletion will be disabled');
}

// Configure Cloudinary only if all required variables are present
if (missingEnvVars.length === 0) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * Delete an image from Cloudinary using the public ID
 * @param {string} imageUrl - The Cloudinary URL of the image
 * @returns {Promise<Object>} - Result of the deletion operation
 */
export async function deleteImageFromCloudinary(imageUrl) {
  try {
    if (!imageUrl) {
      console.log('No image URL provided for deletion');
      return { success: true, message: 'No image to delete' };
    }

    // Check if Cloudinary is properly configured
    if (missingEnvVars.length > 0) {
      console.warn('Cloudinary not configured, skipping image deletion');
      return { success: false, message: 'Cloudinary not configured' };
    }

    // Extract public ID from Cloudinary URL
    // Cloudinary URLs are in format: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/folder/filename.jpg
    const urlParts = imageUrl.split('/');
    const uploadIndex = urlParts.findIndex(part => part === 'upload');
    
    if (uploadIndex === -1) {
      console.log('Invalid Cloudinary URL format:', imageUrl);
      return { success: false, message: 'Invalid Cloudinary URL format' };
    }

    // Get the path after 'upload' (excluding version if present)
    let publicId = urlParts.slice(uploadIndex + 1).join('/');
    
    // Remove file extension
    publicId = publicId.replace(/\.[^/.]+$/, '');
    
    // Remove version prefix if present (v1234567890/)
    publicId = publicId.replace(/^v\d+\//, '');

    console.log('Attempting to delete image with public ID:', publicId);

    const result = await cloudinary.uploader.destroy(publicId);
    
    if (result.result === 'ok') {
      console.log('Successfully deleted image from Cloudinary:', publicId);
      return { success: true, message: 'Image deleted successfully' };
    } else {
      console.log('Failed to delete image from Cloudinary:', result);
      return { success: false, message: 'Failed to delete image from Cloudinary' };
    }
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Delete multiple images from Cloudinary
 * @param {string[]} imageUrls - Array of Cloudinary URLs
 * @returns {Promise<Object>} - Result of the deletion operations
 */
export async function deleteMultipleImagesFromCloudinary(imageUrls) {
  try {
    if (!imageUrls || imageUrls.length === 0) {
      return { success: true, message: 'No images to delete' };
    }

    const results = await Promise.allSettled(
      imageUrls.map(url => deleteImageFromCloudinary(url))
    );

    const successful = results.filter(result => 
      result.status === 'fulfilled' && result.value.success
    ).length;

    const failed = results.length - successful;

    console.log(`Deleted ${successful} images successfully, ${failed} failed`);

    return {
      success: failed === 0,
      message: `Deleted ${successful} images successfully${failed > 0 ? `, ${failed} failed` : ''}`,
      results
    };
  } catch (error) {
    console.error('Error deleting multiple images from Cloudinary:', error);
    return { success: false, message: error.message };
  }
} 