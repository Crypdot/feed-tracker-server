var express = require('express');
var router = express.Router();
var util = require('util');
const mysql = require('mysql');
const app = new express();

const conn = mysql.createConnection({
  host: "localhost",
  user: "feed-tracker",
  password: "re53,trk",
});

conn.connect(function(err){
  if(err) throw err;
  console.log('Connection to SQL database successful!');
});

const query = util.promisify(conn.query).bind(conn);

//A helper function that will calculate the next date to feed the pet with any given pet_id. 
async function getNextFeedTime(pet_id_g){
  const sql = "SELECT next_feeding, hours_between_feed FROM feed_tracker.feed_schedule WHERE pet_id = ?";
  try{
    const rows = await query(sql, [
      pet_id_g,
    ]);

    const date = new Date(rows[0].next_feeding);
    const hours = rows[0].hours_between_feed;
    date.setHours(date.getHours()+hours);

    return date.toISOString().slice(0,19).replace('T', ' ');
  }
  catch(err){
    console.log("Something went wrong: "+err);
  }
}

async function removeFeed(feed_id, number_removed){
  const sql = "SELECT quantity FROM feed_tracker.feed WHERE id = ?";
  try{
    conn.query(sql, [feed_id], function(err, result){
      if(err) throw err;
      var quantity = result[0].quantity;

      quantity = quantity - number_removed;
      if(quantity < 0) quantity = 0; //If the quantity is less than 0, set it to 0.

      const sql2 = "UPDATE feed_tracker.feed SET quantity = ? WHERE id = ?";
      try{
        conn.query(sql2, [quantity, feed_id], function(err, result){
          if(err) throw err;
          console.log("Feed quantity updated! Feed left: "+quantity);
          return quantity;
        });
      }
      catch(err){
        console.log("Something went wrong: "+err);
      }
      
  });
  }catch(err){
    console.log("Something went wrong: "+err);
  }
}

/* POST add a new pet to the database. */
router.post('/add-pet', async function(req, res, next){
  //What if the user didn't add a water check? Is a NULL value acceptable?
  var timestamp = Date.now()/1000;
  console.log("---timestamp---")
  console.log(timestamp);
  var datetime = new Date(timestamp * 1000);  

  const name = req.query.petName;
  const description = req.query.petDescription;
  const feeding_hours = req.query.feeding_hours;
  const feed_id = req.query.feed_id;
  const next_feeding = req.query.next_feeding;
  const water_check = datetime;

  const sql = "INSERT INTO feed_tracker.pets (petName, petDescription, water_check, feed_id) VALUES (?, ?, ?, ?)";
  try{
    conn.query(sql, [name, description, water_check, feed_id], (error, results)=>{
      if(error){ 
        console.log("Something went wrong: " + error);
        throw error;
      }else{
        const pet_id = results.insertId;
        const sql = "INSERT INTO feed_tracker.feed_schedule (pet_id, feed_id, next_feeding, hours_between_feed) VALUES (?, ?, ?, ?)";
        conn.query(sql, [pet_id, feed_id, next_feeding, feeding_hours], (error, results)=>{
          if(error){
            console.log("Something went wrong: " + error);
            throw error;
          }else{
            console.log("Successfully added a new pet!");
            res.send({message: "Successfully added a new pet!"});
          }
        });
      }
      console.log(results);
    });

  }
  catch(err){
    console.log("Something went wrong: "+err);
  }
});

/* POST adds a new type of feed to database */
router.post('/add-feed', async function(req, res, next){
  const sql = "INSERT INTO feed_tracker.feed (feedName, size, quantity) VALUES (?, ?, ?)";

  try{
    const rows = await query(sql, [
      req.query.feedName, 
      req.query.size,
      req.query.quantity, 
    ]);

    console.log("Upload successful!");
    return res.send({message: "Feed created successfully!"});
  }
  catch(err){
    console.log("Something went wrong: "+err);
  }
});

router.post('/update-feed', async function(req,res,next){
  const sql = "UPDATE feed_tracker.feed SET feedName = ?, size = ?, quantity = ? WHERE feed_id = ?";
  const feed_id = req.query.feed_id;
  const feedName = req.query.feedName;
  const size = req.query.size;
  const quantity = req.query.quantity;

  try{
    conn.query(sql, [feedName, size, quantity, feed_id], (error, results)=>{
      if(error){
        console.log("Something went wrong: " + error);
        throw error;
      }else{
        console.log("Successfully updated feed!");
        res.send({message: "Successfully updated feed!"});
      }
    });
  }
  catch(err){
    console.log("Something went wrong: "+err);
  }

});

/* POST adds a new feeding-event to the database
  Note: This call doesn't currently throw any warnings if the user has no feed left. Should it? Or can we consider it an edge case? Either way, it should be handled _somehow_.
*/
router.post('/add-feeding-event', async function(req, res, next){
  const pet_id = req.query.pet_id;
  const feed_id = req.query.feed_id;
  const feed_quantity = req.query.feed_quantity;
  //feeding_time here is just a placeholder until I implement it in the front-end.
  const feeding_time = new Date();
  feeding_time.toISOString().slice(0,19).replace('T', ' ');
  //const feeding_time = req.query.feeding_time;
  const feedComment = req.query.feedComment;
  const next_feeding = await getNextFeedTime(pet_id);
  console.log("next_feeding: "+next_feeding);

  try{
    await removeFeed(feed_id, req.query.feed_quantity);
  }catch(err){
    console.log("Something went wrong: "+err);
  }
  
  const sql = "INSERT INTO feed_tracker.feed_history (pet_id, feed_id, feed_quantity, feeding_time, feedComment) VALUES (?, ?, ?, ?, ?)";
  try{
    conn.query(sql, [ pet_id, feed_id, feed_quantity, feeding_time, feedComment ], (error, results)=>{
      if(error){ 
        console.log("Something went wrong: " + error);
        throw error;
      }else{
        const sql = "UPDATE feed_tracker.feed_schedule SET next_feeding = ? WHERE pet_id = ?";

        conn.query(sql, [next_feeding, pet_id], (error, results)=>{
          if(error){
            console.log("Something went wrong: " + error);
            throw error;
          }else{
            console.log("Successfully updated the feeding schedule!");
            res.send({message: "Successfully updated the feeding schedule!"});
          }
        });
      }
      console.log(results);
    });

  }
  catch(err){
    console.log("Something went wrong: "+err);
  }  
});

/* POST adds a new feeding schedule to the database 
  Note: This may be redundant; the schedule for each pet is already created when the pet is created.
*/
router.post('/add-schedule', async function(req, res, next){
  const sql = "INSERT INTO feed_tracker.feeding_schedule (pet_id, feed_id, feeding_time) VALUES (?, ?, ?)";

  try{
    const rows = await query(sql[
      req.query.pet_id,
      req.query.feed_id,
      req.query.feeding_time
    ]);
    return res.send({message: "Schedule created successfully!"});
  }
  catch(err){
    console.log("Something went wrong: "+err);
  }
});

/* POST updates the last time the user has checked the pet's water dish */
router.post('/update-watercheck', async function(req, res, next){
  var timestamp = Date.now()/1000;  
  console.log("---timestamp---")
  console.log(timestamp);
  var datetime = new Date(timestamp * 1000);  

  const sql = "UPDATE feed_tracker.pets SET water_check = ? WHERE id = ?";

  try{
    const rows = await query(sql, [
      datetime,
      req.query.Id,
    ]);

    res.send({message: "Water check updated successfully!"});
  }catch(err){
    console.log("Something went wrong: "+err);
  }
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

/* GET the next feeding date of the pet via pet_id. */
router.get('/next-feeding', async function(req, res, next){
  const sql = "SELECT next_feeding, hours_between_feed FROM feed_tracker.feed_schedule WHERE pet_id = ?";
  try{
    const rows = await query(sql, [
      req.query.id,
    ]);

    const date = new Date(rows[0].next_feeding);

    return res.send(date.toISOString());
  }
  catch(err){
    console.log("Something went wrong: "+err);
  }
});

/* GET specific pet via pet_id */
router.get('/pet-data', async function(req, res, next){
  const sql = "SELECT * FROM feed_tracker.pets WHERE id = ?";
  try{
    const rows = await query(sql, [
      req.query.id,
    ]);
    return res.send(rows);
  }catch(err){
    console.log("Something went wrong: "+err);
  }
});

/* GET all pets from the database */
router.get('/get-all-pets', async function(req, res){
  const sql = "SELECT * FROM feed_tracker.pets";
  try{
    const result = await query(sql);
    res.json(result);

  }
  catch(err){
    console.log("Something went wrong: "+err);
  }
});

/* GET all feed from the database */
router.get('/get-all-feed', async function(req, res){
  const sql = "SELECT * FROM feed_tracker.feed";
  try{
    const result = await query(sql);
    res.json(result);
  }
  catch(err){
    console.log("Something went wrong: "+err);
  }
});

module.exports = router;