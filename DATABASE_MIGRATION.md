# Database Migration Guide

This guide will help you migrate all data from your old MongoDB Atlas database to the new one.

## ✅ What's Been Done

1. ✅ **Updated connection string** in `lib/mongodb.ts` to use the new database
2. ✅ **Created migration API endpoint** at `/api/migrate-to-new-db`
3. ✅ **Migration script** copies all collections, documents, and indexes

## 📋 Step-by-Step Migration Process

### Step 1: Update Environment Variables in Vercel/Render

**Important:** Update the `MONGODB_URI` environment variable before running the migration.

#### For Vercel:
1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Find `MONGODB_URI` and click **Edit**
4. Update the value to:
   ```
   mongodb+srv://root:zUQfjzImQWoof7xs@cluster0.cyu0ctf.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0
   ```
5. Make sure it's set for **Production**, **Preview**, and **Development**
6. Click **Save**
7. **Redeploy** your application (or wait for next deployment)

#### For Render:
1. Go to your Render dashboard
2. Select your web service
3. Navigate to **Environment** tab
4. Find `MONGODB_URI` and click **Edit**
5. Update the value to:
   ```
   mongodb+srv://root:zUQfjzImQWoof7xs@cluster0.cyu0ctf.mongodb.net/OP_Portfolio_Dashboard?retryWrites=true&w=majority&appName=Cluster0
   ```
6. Click **Save Changes**

### Step 2: Verify New Database Connection

1. Visit your deployed application
2. Go to **DB Stats** page (click "DB Stats" in navigation)
3. Verify it connects to the new database (should show empty or minimal data initially)

### Step 3: Run the Migration

**Option A: Via Browser (Recommended)**

1. Visit this URL (replace with your deployment URL):
   ```
   https://YOUR-APP-URL.vercel.app/api/migrate-to-new-db
   ```
   
2. Wait for the migration to complete (this may take several minutes depending on data size)

3. You'll see a JSON response showing:
   - Collections migrated
   - Documents migrated
   - Success/error status for each collection

**Option B: With Delete Old Data**

To migrate AND delete from old database:
```
https://YOUR-APP-URL.vercel.app/api/migrate-to-new-db?deleteOld=true
```

⚠️ **Warning:** Only use `deleteOld=true` AFTER verifying the migration was successful!

### Step 4: Verify Migration Success

1. **Check DB Stats Page:**
   - Visit `/db-stats` on your application
   - Verify all collections are present
   - Check document counts match expected values

2. **Test Your Application:**
   - Login to dashboard
   - Verify holdings are displayed
   - Check stock analytics
   - Verify stock research data

3. **Check Migration Response:**
   - The migration endpoint returns detailed results
   - Look for `success: true`
   - Check `totalDocumentsMigrated` count
   - Verify no `status: 'error'` in results

### Step 5: Delete Old Database (Optional)

Once you've verified everything works:

1. Go to MongoDB Atlas dashboard
2. Navigate to the **old cluster** (cluster0.wigbba7)
3. Click **...** → **Drop Database**
4. Confirm deletion

**OR** run the migration again with `?deleteOld=true` parameter.

## 🔍 What Gets Migrated

The migration script copies:

- ✅ **All Collections** (Holdings, StockData, StockMaster, Transactions, RealizedProfitLoss, etc.)
- ✅ **All Documents** in each collection
- ✅ **All Indexes** (unique indexes, compound indexes, etc.)
- ✅ **Document IDs** (preserves _id fields for consistency)

## 📊 Expected Migration Output

```json
{
  "success": true,
  "message": "Migration completed successfully",
  "summary": {
    "totalCollections": 6,
    "totalDocumentsMigrated": 125000,
    "collectionsMigrated": 6,
    "collectionsSkipped": 0,
    "collectionsFailed": 0
  },
  "results": [
    {
      "collection": "holdings",
      "status": "success",
      "documentsInOld": 20,
      "documentsMigrated": 20,
      "documentsInNew": 20
    },
    {
      "collection": "stockdata",
      "status": "success",
      "documentsInOld": 100000,
      "documentsMigrated": 100000,
      "documentsInNew": 100000
    }
    // ... more collections
  ]
}
```

## ⚠️ Important Notes

1. **Migration Time:** Large databases (100k+ documents) may take 10-30 minutes
2. **No Downtime:** Application continues to work during migration
3. **Duplicate Handling:** If documents already exist, duplicates are skipped
4. **Indexes:** Indexes are recreated in the new database
5. **Connection String:** Already updated in code, just need to update environment variables

## 🐛 Troubleshooting

### Migration Fails with Connection Error

**Problem:** Cannot connect to old or new database

**Solution:**
- Verify IP whitelist in MongoDB Atlas includes `0.0.0.0/0`
- Check connection strings are correct
- Verify database user has read/write permissions

### Some Collections Failed to Migrate

**Problem:** Migration shows errors for certain collections

**Solution:**
- Check the error message in the migration response
- Verify collection names are correct
- Try running migration again (it will skip duplicates)

### Documents Not Showing After Migration

**Problem:** Migration completed but data not visible

**Solution:**
- Clear browser cache
- Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)
- Check DB Stats page to verify data exists
- Verify environment variable is updated and app is redeployed

### Migration Takes Too Long

**Problem:** Migration seems stuck

**Solution:**
- Large databases (100k+ documents) take time
- Check server logs for progress
- Migration processes in batches of 1000 documents
- Be patient - it will complete

## ✅ Post-Migration Checklist

- [ ] Updated `MONGODB_URI` in Vercel/Render
- [ ] Ran migration endpoint successfully
- [ ] Verified all collections migrated
- [ ] Verified document counts match
- [ ] Tested application functionality
- [ ] Checked DB Stats page
- [ ] Deleted old database (optional)

## 📞 Need Help?

If migration fails or you encounter issues:

1. Check the migration endpoint response for error details
2. Review server logs for specific error messages
3. Verify both old and new databases are accessible
4. Ensure MongoDB Atlas IP whitelist is configured correctly

---

**Migration Endpoint:** `/api/migrate-to-new-db`
**Migration with Delete:** `/api/migrate-to-new-db?deleteOld=true`

