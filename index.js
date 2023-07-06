const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const jwt = require("jsonwebtoken");

const SSLCommerzPayment = require("sslcommerz-lts");
const store_id = process.env.store_id;
const store_passwd = process.env.store_passwd;
const is_live = false; //true for live, false for sandbox

const port = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.g6tcnhj.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("unauthorized access");
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    const appointmentCollection = client
      .db("dentalCare")
      .collection("appointmentOptions");
    const bookingsCollection = client.db("dentalCare").collection("bookings");
    const usersCollection = client.db("dentalCare").collection("users");
    const doctorsCollection = client.db("dentalCare").collection("doctors");
    const paymentsCollection = client.db("dentalCare").collection("payments");

    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);

      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    app.get("/appointmentOptions", async (req, res) => {
      const date = req.query.date;
      const query = {};
      const options = await appointmentCollection.find(query).toArray();
      const bookingsQuery = { appointmentDate: date };
      const alreadyBooked = await bookingsCollection
        .find(bookingsQuery)
        .toArray();
      options.forEach((option) => {
        const optionBooked = alreadyBooked.filter(
          (booked) => booked.treatment === option.name
        );
        const bookedSlots = optionBooked.map((booked) => booked.slot);
        const remainingSlots = option.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );

        option.slots = remainingSlots;
      });
      res.send(options);
    });

    app.get("/appointmentOptions", async (req, res) => {
      const date = req.query.date;
      const options = await appointmentCollection
        .aggregate([
          {
            $lookup: {
              from: "bookings",
              localField: "name",
              foreignField: "treatment",
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ["$appointmentDate", date],
                    },
                  },
                },
              ],
              as: "booked",
            },
          },
          {
            $project: {
              name: 1,
              slots: 1,
              booked: {
                $map: {
                  input: "$booked",
                  as: "book",
                  in: "$$book.slot",
                },
              },
            },
          },
          {
            $project: {
              name: 1,
              slots: {
                $setDifference: ["$slots", "$booked"],
              },
            },
          },
        ])
        .toArray();
      res.send(options);
    });

    app.get("/appointmentSpecialty", async (req, res) => {
      const query = {};
      const result = await appointmentCollection
        .find(query)
        .project({ name: 1 })
        .toArray();
      res.send(result);
    });

    // app.get("/bookings", async (req, res) => {
    //   const email = req.query.email;
    //   const decodedEmail = req.decoded.email;
    //   if (email !== decodedEmail) {
    //     return res.status(403).send({ message: "forbidden access" });
    //   }
    //   const query = { email: email };
    //   const bookings = await bookingsCollection.findOne(query);
    //   res.send(bookings);
    // });
    app.get("/bookings", async (req, res) => {
      const query = {};
      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
    });

    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const booking = await bookingsCollection.find(query).toArray();
      res.send(booking);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      const query = {
        appointmentDate: booking.appointmentDate,
        email: booking.email,
        treatment: booking.treatment,
      };
      const alreadyBooked = await bookingsCollection.find(query).toArray();
      if (alreadyBooked.length) {
        const message = `You already have an appointment on ${booking.appointmentDate}`;
        return res.send({ acknowledged: false, message });
      }
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      const price = booking.price;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/ssl-request", async (req, res) => {
      /**
       * Create ssl session request
       */

      const data = {
        total_amount: 100,
        currency: "BDT",
        tran_id: "REF123",
        success_url: `${process.env.ROOT}/ssl-payment-success`,
        fail_url: `${process.env.ROOT}/ssl-payment-fail`,
        cancel_url: `${process.env.ROOT}/ssl-payment-cancel`,
        shipping_method: "No",
        product_name: "Computer.",
        product_category: "Electronic",
        product_profile: "general",
        cus_name: "Customer Name",
        cus_email: "cust@yahoo.com",
        cus_add1: "Dhaka",
        cus_add2: "Dhaka",
        cus_city: "Dhaka",
        cus_state: "Dhaka",
        cus_postcode: "1000",
        cus_country: "Bangladesh",
        cus_phone: "01711111111",
        cus_fax: "01711111111",
        multi_card_name: "mastercard",
        value_a: "ref001_A",
        value_b: "ref002_B",
        value_c: "ref003_C",
        value_d: "ref004_D",
        ipn_url: `${process.env.ROOT}/ssl-payment-notification`,
      };

      const sslcommerz = new SSLCommerzPayment(
        process.env.STORE_ID,
        process.env.STORE_PASSWORD,
        false
      ); //true for live default false for sandbox
      sslcommerz.init(data).then((data) => {
        //process the response that got from sslcommerz
        //https://developer.sslcommerz.com/doc/v4/#returned-parameters

        if (data?.GatewayPageURL) {
          return res.status(200).redirect(data?.GatewayPageURL);
        } else {
          return res.status(400).json({
            message: "Session was not successful",
          });
        }
      });
    });

    app.post("/ssl-payment-notification", async (req, res) => {
      /**
       * If payment notification
       */

      return res.status(200).json({
        data: req.body,
        message: "Payment notification",
      });
    });

    app.post("/ssl-payment-success", async (req, res) => {
      /**
       * If payment successful
       */

      return res.status(200).json({
        data: req.body,
        message: "Payment success",
      });
    });

    app.post("/ssl-payment-fail", async (req, res) => {
      /**
       * If payment failed
       */

      return res.status(200).json({
        data: req.body,
        message: "Payment failed",
      });
    });

    app.post("/ssl-payment-cancel", async (req, res) => {
      /**
       * If payment cancelled
       */

      return res.status(200).json({
        data: req.body,
        message: "Payment cancelled",
      });
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);
      const id = payment.bookingId;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const updatedResult = await bookingsCollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(result);
    });

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "1hr",
        });
        return res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: "" });
    });

    app.get("/users", async (req, res) => {
      const query = {};
      const users = await usersCollection.find(query).toArray();
      res.send(users);
    });

    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.role === "admin" });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.put("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const option = { upsert: true };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc, option);
      res.send(result);
    });
    app.get("/addPrice", async (req, res) => {
      const filter = {};
      const option = { upsert: true };
      const updateDoc = {
        $set: {
          price: 99,
        },
      };
      const result = await appointmentCollection.updateMany(
        filter,
        updateDoc,
        option
      );
      res.send(result);
    });

    app.get("/doctors", async (req, res) => {
      const query = {};
      const doctors = await doctorsCollection.find(query).toArray();
      res.send(doctors);
    });

    app.post("/doctors", async (req, res) => {
      const doctor = req.body;
      const result = await doctorsCollection.insertOne(doctor);
      res.send(result);
    });

    app.delete("/doctors/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await doctorsCollection.deleteOne(filter);
      res.send(result);
    });
  } finally {
  }
}
run().catch((error) => console.log(error));

app.get("/", (req, res) => {
  res.send("Hello Dental Care Server");
});
app.listen(port, () => {
  console.log(`Dental Care server running on port: ${port}`);
});
