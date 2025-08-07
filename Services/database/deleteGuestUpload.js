import pool from '../../db/db.js';

export async function deleteGuestUpload(req, res) {
  try {
    const { uploadId } = req.params;

    if (!uploadId) {
      return res.status(400).json({ error: 'Upload ID is required' });
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete the upload (contacts will be deleted automatically due to CASCADE)
      const result = await client.query(`
        DELETE FROM guest_contact_uploads 
        WHERE upload_id = $1
      `, [uploadId]);
      
      await client.query('COMMIT');
      
      console.log(`Deleted guest upload: ${uploadId}`);
      res.json({ 
        success: true, 
        deleted: result.rowCount > 0,
        message: result.rowCount > 0 ? 'Upload deleted successfully' : 'Upload not found'
      });
      
    } catch (dbError) {
      await client.query('ROLLBACK');
      console.error('Database error:', dbError);
      throw new Error('Failed to delete guest upload');
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error deleting guest upload:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
} 