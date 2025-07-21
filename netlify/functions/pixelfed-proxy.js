// netlify/functions/pixelfed-proxy.js
const fetch = require('node-fetch');
const { DOMParser } = require('xmldom');

// You'll need to set these as environment variables in Netlify
const PIXELFED_ACCESS_TOKEN = process.env.PIXELFED_ACCESS_TOKEN;
const RSS_URL = process.env.RSS_URL || 'https://pixelfed.social/account/portfolio/Xover0.rss';

exports.handler = async (event, context) => {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    console.log('🔄 Fetching RSS feed...');
    
    // Check if access token is configured
    if (!PIXELFED_ACCESS_TOKEN) {
      throw new Error('PIXELFED_ACCESS_TOKEN environment variable not set');
    }
    
    // Fetch the RSS feed
    const rssResponse = await fetch(RSS_URL);
    const rssText = await rssResponse.text();
    
    console.log('📋 Parsing RSS feed...');
    
    // Parse RSS feed
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(rssText, 'text/xml');
    const items = xmlDoc.getElementsByTagName('item');
    
    console.log(`📄 Found ${items.length} RSS items`);
    
    const galleryItems = [];
    
    // Process each RSS item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      const title = item.getElementsByTagName('title')[0]?.textContent || '';
      const description = item.getElementsByTagName('description')[0]?.textContent || '';
      const link = item.getElementsByTagName('link')[0]?.textContent || '';
      
      // Extract post ID from link
      const postId = link.split('/').pop();
      
      console.log(`🌐 Fetching images for post ${postId}...`);
      
      try {
        // Fetch post data from Pixelfed API using Personal Access Token
        const apiResponse = await fetch(`https://pixelfed.social/api/v1/statuses/${postId}`, {
          headers: {
            'Authorization': `Bearer ${PIXELFED_ACCESS_TOKEN}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        });
        
        console.log(`API Response status for ${postId}: ${apiResponse.status}`);
        
        if (apiResponse.ok) {
          const postData = await apiResponse.json();
          
          // Extract image URLs from media attachments
          if (postData.media_attachments && postData.media_attachments.length > 0) {
            const imageUrl = postData.media_attachments[0].url;
            
            galleryItems.push({
              title: title.replace('Post by Xover0 on ', ''),
              description: description.replace(/<[^>]*>/g, '').trim(),
              link,
              imageUrl,
              postId,
            });
            
            console.log(`✅ Added post ${postId} with image: ${imageUrl.substring(0, 50)}...`);
          } else {
            console.log(`⚠️ No media attachments found for post ${postId}`);
            console.log('Post data structure:', JSON.stringify(postData, null, 2).substring(0, 500));
          }
        } else {
          const errorText = await apiResponse.text();
          console.log(`❌ API call failed for post ${postId}: ${apiResponse.status} - ${errorText}`);
        }
      } catch (apiError) {
        console.error(`❌ Error fetching post ${postId}:`, apiError.message);
      }
    }
    
    console.log(`🎉 Successfully processed ${galleryItems.length} items with images`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        items: galleryItems,
        count: galleryItems.length,
        message: galleryItems.length > 0 ? 'Success' : 'No items with images found',
      }),
    };
    
  } catch (error) {
    console.error('💥 Error processing RSS feed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        items: [],
      }),
    };
  }
};
