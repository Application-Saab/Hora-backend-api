const express = require('express');
const cityServedModel = require('../models/city-served');
const router = express.Router();

router.get('/search', async (req, res) => {
    // const options={
    //     'location.coordinates':{
    //         $geoWithin:{
    //             $centerSphere:[[77.4520788,28.68467],1000]
    //         }    
    //     }
    // }
    // const query = {
    //     "location.geo": {
    //       $near: {
    //         $geometry: { type: "Point", coordinates: [77.4520788,28.68467] },
    //         $maxDistance: 10000,
    //       },
    //     },
    //   };
    // const cursor = cityServedModel.find({polygons:
    //     {      
    //     $geoIntersects: {
    //          $geometry: {
    //             "type" : "Point",
    //             coordinates: [ 77.4520788,28.68467  ]
    //          }
    //       }
    //    }
    //  });
    // console.log("options>>>",options);
    // console.log("cursor>>>",cursor);
    cityServedModel.find({
        $geoWithin: {$centerSphere: {type: "Point", coordinates:[-0.127748, 51.507333]}}
     }, "street", function(err, response) {
        if (err) return err;
        console.log(err)
        console.log(response)
        return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: 'data'})
    });
    //  console.log(data)
    // try {
    //     const data = await cityServedModel.find(options);
    //     console.log("data>>>>>",data)
    //     return res.json({ error: false,status:200, message: 'Details Fetch Successfully', data:data})
    //     if(city_served.length>0){
    //         return res.json({ error: false,status:200, message: 'Fetch Data Successfully', data: { city_served: OverallResult, paginate }})
    //     }else{
    //         return res.json({ error: true,status:503, message: 'No Record Found'})
    //     }
    // }
    // catch (error) {
    //     res.status(400).json({ message: error.message ,error: true })
    // }
})

module.exports = router;