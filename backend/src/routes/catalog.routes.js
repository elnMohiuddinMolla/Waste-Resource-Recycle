// ==============================================================================
// Waste Resource Recycle (WRR) - Public Catalog Routes (/api/v1/categories, /api/v1/zones)
// Public: the registration and request forms need these lists.
// ==============================================================================

const express = require('express');
const catalogController = require('../controllers/catalog.controller');

const router = express.Router();

router.get('/categories', catalogController.listCategories);
router.get('/zones', catalogController.listZones);

module.exports = router;
