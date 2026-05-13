const SearchService = require('./service');
const ApiResponse = require('../../utils/apiResponse');

class SearchController {
  static async search(req, res, next) {
    try {
      const { q } = req.query;
      const data = await SearchService.search(q);
      return ApiResponse.success(res, data, 'Search results');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SearchController;
