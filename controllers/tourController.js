const Tour = require('./../models/tourModel');
const catchAsync = require('./../utils/catchAsync');
const Factory = require('./handlerFactory');
const AppError = require('./../utils/appError');

//middleware function
exports.alias = (req, res, next) => {
  req.query.limit = '5';
  req.query.sort = '-ratingsAverage,price';
  req.query.fields = 'name, price, ratingsAverage, summary, difficulty';
  next();
};

exports.getAllTours = Factory.getAll(Tour);
exports.getTour = Factory.getOne(Tour, { path: 'reviews' }); //virtual populateee
exports.addTour = Factory.createOne(Tour);
exports.updateTour = Factory.updateOne(Tour);
exports.deleteTour = Factory.deleteOne(Tour);

exports.getTourStats = catchAsync(async (req, res, next) => {
  const stats = await Tour.aggregate([
    {
      $match: { ratingsAverage: { $gte: 4.5 } }
    },
    {
      $group: {
        _id: { $toUpper: '$difficulty' },
        numTours: { $sum: 1 },
        numRatings: { $sum: '$ratingsQuantity' },
        avgRating: { $avg: '$ratingsAverage' },
        avgPrice: { $avg: '$price' },
        minPrice: { $min: '$price' },
        maxPrice: { $max: '$price' }
      }
    },
    {
      $sort: { avgPrice: -1 } //-1 = sort in descending and 1 = sort in ascending
    }
    // {
    //   $match: { _id: { $ne: 'EASY' } } //to show that we can use two match operator
    // }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      stats
    }
  });
});

exports.getMonthlyPlan = catchAsync(async (req, res, next) => {
  const year = req.params.year * 1;
  const plan = await Tour.aggregate([
    {
      $unwind: '$startDates'
    },
    {
      $group: {
        _id: { $month: '$startDates' },
        numTourStarts: { $sum: 1 },
        tours: { $push: '$name' }
      }
    },
    {
      $addFields: { month: '$_id' }
    },
    {
      $project: {
        _id: 0 //0 to delete and 1 to show
      }
    },
    {
      $sort: { numTourStarts: -1 } //-1 = descending and 1 = ascending
    },
    {
      $limit: 12
    }
  ]);

  res.status(200).json({
    status: 'success',
    results: plan.length,
    data: { plan }
  });
});

exports.getToursWithin = catchAsync(async (req, res, next) => {
  const { distance, latlng, unit } = req.params;

  const [lat, lng] = latlng.split(',');
  console.log(distance, latlng, unit);

  const radius = unit === 'mi' ? distance / 3963.2 : distance / 6378.1;
  //3963.2 = radius of earth in miles, 6378.1 = radius of earth in kilometres
  // distance / radius of earth because mongodb accepts this as a standard unit for determining radius

  if (!lat || !lng) {
    return next(new AppError('Please provide latitude and longitude in the provided format', 400));
  }

  const tours = await Tour.find({
    //QUERY TO FIND TOURS WITHIN A SPECIFIED RADIUS STARTING FROM A POINT
    //geo JSON accepts 'lng, lat' and not 'lat, lng' which is used in general
    startLocation: { $geoWithin: { $centerSphere: [[lng, lat], radius] } }
  });

  res.status(200).json({
    status: 'success',
    results: tours.length,
    data: {
      data: tours
    }
  });
});

exports.getDistances = catchAsync(async (req, res, next) => {
  const { latlng, unit } = req.params;
  const [lat, lng] = latlng.split(',');
  const multiplier = unit === 'mi' ? 0.000621371 : 0.001;

  if (!lat || !lng) {
    return next(new AppError('Please provide latitude and longitude in the provided format', 400));
  }

  //AGGREGATION IS ALWAYS CALLED ON THE MODEL
  //GEOSPATIAL aggregation has only one single stage called '$geoNear'
  const distances = await Tour.aggregate([
    //$geoNear always needs to be the first stage in the pipeline
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [lng * 1, lat * 1] //converting it to a number by multiplying it with 1
        },
        distanceField: 'distance', //it has to be 'distance' only
        distanceMultiplier: multiplier
      }
    },
    {
      $project: {
        distance: 1,
        name: 1
      }
    }
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      data: distances
    }
  });
});
