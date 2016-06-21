Introduction to Passport
========================

## Overview

In this lesson, we are going to learn how to use the popular Node library [Passport.js](http://passportjs.org/) to implement user authentication on our blog.

By the end of this lesson, you will be able to:
* Explain the Passport authentication workflow.
* Use bcrypt and Bookshelf to encrypt user passwords.
* Implement a Passport "strategy" for authenticating users by password.

## What is Passport?

User authentication, as you well know, is fundamental to almost every web application in existence. (This much we know for sure, right? I mean how long is your password list?)

Now given the ubiquity of the need to impelement this user authentication as a feature of our web apps, it wouldn't make sense to implement it from scratch each time.

This is where Passport comes in. Passport is the most widely used tool for impelementing authentication in the Node ecosystem.

## Getting Things Going

In order to use passport, we of course need to install the module. We can do so now, and install all the other modules that we'll be using as well, by running `npm install`. (Check the `package.json` for the list of dependencies we'll be installing.)

Now we need to retrofit our blog server to use passport. For the pruposes of this code-along, we've imported the implementation of our blog from the "Intro to Bookshelf" lab with a bit of reorganization.

You'll notice that instead of having the single file containing all our server code, we have instead a modularized setup that can be found in the `app` directory. This modular setup allows us to pull some of the configuration assocaited with the models into other files. In addition to being a generally superior way of organizing an application -- that is frankly necessary in larger products -- this makes our server code, located in `./app/index.js` more minimal.

Okay so let's get underway. Our first step is pretty easy. We just need to require passport, as well as a series of other modules that we'll be using, and then register the passport middleware with our Express app.

To do this first add the following require statement near the other require statements at the top of our `index.js` file:

```
const passport = require('passport');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');
```

Then in the code section that configures our Express app we just need to update the section were we setup our express app to look like this:

``` .
const app = express();
app.use(flash());
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(session({secret: 'our secret string'}));
app.use(cookieParser());
app.use(passport.initialize()); // <-- Register the Passport middleware.
```

Great — we're finished with the first step! This doesn't look like much, but we've actually accomplished a great deal here by leveraging the power of existing modules combined with Express's middleware registration system (i.e. the `use()` method). Here's a list of what we've just done:
* We enabled our app to maintain a session object on our requests (e.g. `req.session`)
* We activated a parser that can read any cookie's sent by the client browser.
* We activated the use of flash messages to pass messages back to the client if there's an error during login.
* We activated our body parser so that it can read both JSON input and input from html forms.
* We registered the passport middleware with our Express app.

All of these steps are needed, of course, but the last step, in particular, is key because it allows us to move on to the next and core step of this whole process: namely, defining a strategy!

## Setting up the Local Strategy (Part 1): Modifying our Users Model

What we'll be doing in the next two sections is setting up a method that will allow our users to login with a username and password. However, currently our User model doesn't support a user having a password, so we'll need to set that up. We are also going to want that password to be encyprted to keep things nice and secure.

First let's handle the migration. On your command line, enter the command `knex migrate:make add_password_field`. This should generate a new migrations file in our `migrations` directory into which we can place the following code to add the column:

```
exports.up = function(knex, Promise) {
  return knex.schema.table('users', (tbl) => {
    tbl.string('password', 128);
  });
};

exports.down = function(knex, Promise) {
  return knex.schema.table('users', (tbl) => {
    tbl.dropColumn('password');
  });
};
```

In order to run this migration we can either wait until we run our server at which point the server's up function will run all the latest migrations, or we can do it manually now by doing `knex migrate:latest`.

Now we have a password field in our database, but we still need to link the change to our Bookshelf model definition for user. To do this open the `app/models/user.js` file. Our first step here is to install the bcrypt module that we will use to encrypt the password. Do that by installing it with `npm install bcrypt --save`, and then require it at the top of the file like so:

```
const bcrypt = require('bcrypt');
```

Now, finally, modify the User model definition so that it looks like the following:

```
const User = bookshelf.Model.extend({
  tableName: 'users',
  initialize: function() {
    this.on('creating', this.encryptPassword);
  },
  hasTimestamps: true,
  posts: function() {
    return this.hasMany(Posts, 'author');
  },
  comments: function() {
    return this.hasMany(Comments);
  },
  encryptPassword:(model, attrs, options) => {
    return new Promise((resolve, reject) => {
      bcrypt.hash(model.attributes.password, 10, (err, hash) => {
        if (err) return reject(err);
        model.set('password', hash);
        resolve(hash);
      });
    });
  },
  validatePassword: function(suppliedPassword) {
    let self = this;
    return new Promise(function(resolve, reject) {
      const hash = self.attributes.password;
      bcrypt.compare(suppliedPassword, hash, (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    });
  }
});
```

So what is going on in this code? The first thing we're doing is adding an "override" for the User model's default `initalize` method, and within that override we are setting an event listener on the event called "creating". In other words, when the model is "creating" a new user we want it to call the specified method: `this.encryptPassword`.

Now, `encryptPassword`, as you can see, is a method that we've defined on the User model. That function returns a Promise that encrypts the user's supplied password using the bcrypt module. The promise either resolves with the hashed value of the password, or rejects, providing the error supplied by bcrypt as the reason.

To check that this is working, add a new user by posting the appopriate data (i.e. name, username, email, password) to the `/user` route using either curl or Postman. Once you've created the user, check your database's users table. You should see a hash value in the password field that looks something like this:

```
$2a$10$pLOHxDVtdYQgemM2yVN.bOMTvWeMfRTV1ORgIlPPD0X9PBYHmPkCK
```

Great, we're done configuring our schema.

## Setting up the Local Strategy (Part 2): Defining our Strategy

Now we are ready to implement our first Passport strategy! This is a big moment.

But wait! What, you might ask, is a strategy? Perhaps it seems like a strange word to encounter in the context of programming? Perhaps, but in the context it actually fits well.

One of the key features of Passport as an authenication framework is that it is modular and extensible, meaning that it provides a loose framework for programmers to define their own pathways of authentication. It is opinionated about the series of steps that are followed to perform an authentication, but it remains neutral about the specific way that an application authenticates a user.

Why is this a good thing? Well, let's say that in addition to a default username/password login we want to make it possible for users to login through their facebook or google accounts. Each of these methods would represent a unique "Strategy".

Okay, enough theory. Let's get building. We'll begin with a basic username/password authentication strategy. In passport, this is called a "Local Strategy", and there's a module for it called [passport-local](https://github.com/jaredhanson/passport-local). Go ahead and install it using `npm install passport-local --save`.

Once we've installed the module, we need to pull it into our server file with a require statement. We can put it right below where we required passport:

```
const LocalStrategy = require('passport-local').Strategy
```

We've already imported the local strategy middlware module, so all we really need to do at this point is open up `index.js` and somewhere below where our models are defined, define the specific validation logic that suits our application. This can be done like so:

```
passport.use(new LocalStrategy((username, password, done) => {
  User
    .forge({ username: username })
    .fetch()
    .then((usr) => {
      if (!usr) {
        return done(null, false);
      }
      usr.validatePassword(password).then((valid) => {
        if (!valid) {
          return done(null, false);
        }
        return done(null, usr);
      });
    })
    .catch((err) => {
      return done(err);
    });
}));
```

So now we've defined our local strategy. You may very well be wondering how all this fits together, and we'll get to that. But first let's examine what we are doing in our strategy.

Our first step, as you can see, is to create a new Strategy object (`new LocalStrategy`) and then register that with passport via `passport.use()`. However, importantly, when we create the new strategy we pass into the constructor a callback, let's call it our validation function, that defines the *specific way that our application will handle validation.*

This validation function is hugely important to how Passport works, as well as why Passport is such a good library.  Remember above, when we talked about how Passport is unopninated about how an application performs its validation. Well, in addition to being able to choose which strategies an application uses to validate a user, Passport is also unopinionated about what happens during validation within a given strategy! It simply expects a strategy to be defined and for the application itself to provide the validation logic. Pretty clever.

So what is our validation logic? Well, it's pretty straightforward it turns out. The callback we've supplied above takes the username and password, which the user will have supplied when they attempt to login, and then a callback that we've called done.  This callback is important because it is what we'll use to hand control to the next step in server's handling of the request. As we shall see, it has the following signature: `done(error, user[, msg])`.

Inside the function we use our Bookshelf User model to try to fetch a user using the supplied username. Then, if the user is not found we call `done(null, false)` to indicate that there was no error (so `null` for the error argument), but no user was found (so `false` for the user argument). If a user was found, then we try to validate the password using the password validation function that we added to our User model. If the passowrd is invalid, we again call `done(null, false)`. Otherwise, we call `done(null, usr)`, passing the usr that we've found to the next step in the process. Finally, if an error occurs we simply call `done(err)`.

So now that that's done, we can finally set up our `/login` routes so that all this logic can actually be reached by a client.

So what do we need? Well, first of all we'll need some sort of login form. For this, we are going to be using a templating engine called [Handlebars](http://handlebarsjs.com/). This is all setup already, and we won't go through it now because there's a lesson for this later in this unit. For now just add the following route:

```
app.get('/login', (req, res) => {
  res.render('login', { message: req.flash('error) });
});
```

Now comes the crucial moment where we tie all this together! What we'll need, finally, is a validation endpoint (i.e. a server route) where the form data on our login form can be sent to validate the user. Here's where our local strategy will come into play. To get this working we'll define a POST route for `/login` (it could also be called `/authorize` or what have you). It should look like this:

```
app.post('/login',
  passport.authenticate('local', {
    failureRedirect: '/login',
    failureFlash: true
  }),
  function(req, res) {
    res.redirect('/posts');
  });

```

Wow, that's simple! But, take note, there's something unusual about the above route. Do you see it? It takes *two* callbacks after the route name definition. What's going on here is that we are using an alternate syntax for setting up *route-specific* middleware that is provided by Express. If you look at the [Express documentation for the `post()` method](http://expressjs.com/en/4x/api.html#app.post.method), you'll see that it says: "You can provide multiple callback functions that behave just like middleware.... You can use this mechanism to impose pre-conditions on a route, then pass control to subsequent routes if there’s no reason to proceed with the current route."

So, presuming that `authenticate` sucessfully validates, then and only then will our second callback run. And what is this second callback? Well, that's simple it just contains the logic for what to do if the user is validated, and what we've decided to do is send the logged-in user to the `/posts` route. If, on the other hand, the validation fails, we've provided an option to `authenticate` that specifies a `failureRedirect`, which we've set to be the `/login` page. If they fail to login, the user will just end up back at the login form.

We are now nearly done! The last piece is to define two additional functions called `serializeUser` and `deserializelizeUser`. You can add these anywhere, but it makes sense to place them below our local strategy definition. Go ahead and add these now. We'll explain what they do a bit farther on. Here they are:

```
passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(user, done) {
  User
    .forge({id: user})
    .fetch()
    .then((usr) => {
      done(null, usr);
    })
    .catch((err) => {
      done(err);
    });
});
```

## What Have We Done?

OOOOKAY, so are we tired tired yet?

![](https://curriculum-content.s3.amazonaws.com/node-js/sweating.gif)

We're actually done. But you are surely a little confused about how this all fits together, so let's trace the program flow that we've set up. It's important to do this with Passport because not all of its execution flow is immediately evident. So much is hidden away in the middleware. But dont' worry, you'll get the hang of it!

Let's say that someone who is already a user on our system loads up the login form, enters their username and password, and hits submit. Here's what will happen:

1. As a first step, our form submits the form data via POST to the `/login` route that we've just defined. Once this happens the `authentiate` method fires.
2. Now, because we've specified the `local` strategy, the authenticate method will now trigger our local strategy, passing the user's username and password to the validation function that we supplied.
3. Inside our validation function, then, we try to load the user and validate his or her password. When that function calls `done`, control is then passed back to the authenticate method which behaves differently depending on the values passed.
4. If there was a problem, our validation function calls `done(err)` and the authenticate method then redirects the user back to the `/login` page.
4. Similarly, if the user is not found or the password is invalid, control will be passed back to the authenticate method with `done(null, false)`, indicating that validation failed. Again, the user will be directed back to the `/login` page.
5. If validation succeeds, however, we send the validated user object back with `done(null, usr)`, and because the user object was present `authentiate` now calls another key passport function `login()`, which passport has attached to the request (`req`) object.
6. Now is where the mysterious `serializeUser` function that we defined comes into play. Ignore the horrible technical language here. The job of this funciton is simple. It has access to the user object that our validation function passed via the `done` call, and then it determines which information on the user object should be stored in our application's session. It returns this value by calling done.
7. Once `serializeUser` calls the `done` method, passport then stores the value it passed on the session, by setting that value here: `req.session.passport.user`.
8. Now, finally, the second request callback handler method that we defined on the `POST /login` route is called, redirecting the user to `/posts`.

So that's the whole circuit. Now if you fire up your server and try to log in a user you've added manually using either postman or curl, the login form should work as described. Keep in mind that since we've not built a front-end view for the posts page, you'll just get back a JSON array containing any posts.

## Protecting Our Routes (No Pun Intended)

Okay, so now our user can log in. But we haven't actually done anything with this logged-in state. At the moment, a user can login, but a user doesn't need to be logged in to access any of our routes.

To prove that this is the case, clear out your user's session by restarting the server, and try to load the `/posts` page. You'll see that the `/posts` page loads just fine. But we don't want that, do we? The whole point of implementing this authentication system is to be able to protect certain pages from the general public. We must protect our routes!

So how do we do this? The first question to consider here is: what does being logged in actually mean in programmatic terms? What is different about our application state when a user is logged in? We were so busy getting things setup, we may not have asked ourselves this key question.

Well, the answer is fairly straightforward. If you go back to the execution flow that we traced above, you'll see that in step #7, which follows a sucessful authentication, the value returned by our `serializeUser` function is stored on the session. More concretely, that value is set on `req.session.passport.user`. So here we have our answer: when using passport, a user is considered logged in when that `req.session.passport` value is set.

Great! So just to test this out and help us see what's going on in our application, let's right a little piece of custom middleware to help us determine whether our user is logged in or not. Find the section for Express configuration near the top of `index.js` and add the following middleware:

```
app.use((req, res, done) => {
  if (req.session && req.session.passport) {
    console.log('user is logged in: ', req.session.passport);
  }
  else {
    console.log('user not logged in');
  }
  done();
});
```

Now, fire up you server, and try to load the `/posts` page. Now, as before, you should see the post page load, but in our command line console window we should see the output of our console.log in the middlware above, saying: "user not logged in." So this is all wrong! If the user is not logged in we shouldn't be able to see the page, right?

So how can we accomplish this. Actually, it's remarkably easy now that our strategy is configured. All we need to do is write a simple function that follows the same logic as our custom middleware above and checks to see if the user is logged in. If the user is logged in, we'll just call the `done()`; if not, we'll redirect the user back to the login form. So converting our middleware above, this is what we get:

```
const isAuthenticated = (req, res, done) => {
  if (req.session && req.session.passport) {
    return done();
  }
  res.redirect('/login');
};
```

If you test this out, it should work, but there's another way to do it that will help us deepen our knowledge of how Passport works. Above we described the whole execution flow when a user attempts to log in. But what happens when a user loads a resource after they have logged in? In that case, the following steps occur:

1. Express first loads the session data from the client and attaches it to the request (`req`) object. Because the user's authentication succeeded previously, this session object now contains a value set on `req.session.passport` that looks like this: `{ user: 2}`, where `2` is a user id corresponding to a user in our database.
2. As the request is processed by the Express app, the passport middleware that we registered with the `intialize()` method fires. It then calls another function `passport.session()` that checks to see if the user is authenicated (i.e. `req.session.passport.user` is set to equal a user id). If the user is authenticated, it calls our `deserialize` method.
3. The `deserialize` method, by the logic we created ourselves, fetches the user object from the database, and passes it to the next process in the chain via the `done()` method.
4. Having received the user object from the `deserializeUser` method, the `passport.session` function now saves the user on the request object here: `req.user`.

The takeaway here is that in addition to having a serialized user set on the session at `req.session.passport`, the logged-in session will also contain whatever result is passed by the `deserializeUser` function on the request at `req.user`. Therefore, another way to check if the user is logged in is to check if `req.user` is defined. Indeed, Passport provides, by default, a method call `isAuthenticated` on the request object that does just this. So, another way to write our own `isAuthenticated` helper above is like this:

```
const isAuthenticated = (req, res, done) => {
  if (req.isAuthenticated()) {
    return done();
  }
  res.redirect('/login');
};
```

Both method will work, but the latter method is probably more commonly used. Knowing both methods, however, should deepen our understanding of Passport.

But I digress. The point is: now we can protect our routes!

So, as a final step, we can add our `isAuthenticated` custom middleware to any route that we want to protect. We can do so using the same pattern of providing multiple callbacks that we used to run `passport.authenticate` on the `POST /login` route.

So if we want to rejigger the `/posts` route to be a protected route, we can simply add our custom method to the route, like so:

```
app.get('/posts', isAuthenticated, (req, res) => {
  Post
    .collection()
    .fetch()
    .then((posts) => {
      res.send(posts);
    })
    .catch((error) => {
      res.sendStatus(500);
    });
});
```

Now, if  we restart the server, and try to load the `/posts` route, we should be automatically redirected to our login page. And, if we now log the user in, we should then be sucessfully redirected to the posts page.

Wonderful! Now we have a fully functional authentication system.

## Resources

* The Passport documentaiton: http://passportjs.org/docs
* The Express 4.x documentation: http://expressjs.com/en/4x/api.html
