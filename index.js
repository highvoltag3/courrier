var moment = require('moment');
var moment = require('moment-timezone');
var aws = require('aws-sdk');
var ses = new aws.SES();
var s3 = new aws.S3();

exports.handler = function (event, context) {
    
    console.log("Event: " + JSON.stringify(event));
    
    // Check required parameters
    if (event.email === null) {
        context.fail('Bad Request: Missing required member: email');
        return;
    }

    var config = require('./config.js');
    
    // Make sure some expected results are present
    if (event.name === null) {
        event.name = event.email;
    }

    if (event.subject === null) {
        event.subject = config.defaultSubject;
    }
    
    console.log('Loading template from ' + config.templateKey + ' in ' + config.templateBucket);

    // Read the template file
    s3.getObject({
        Bucket: config.templateBucket,
        Key: config.templateKey
    }, function (err, data) {
        if (err) {
            // Error
            console.log(err, err.stack);
            context.fail('Internal Error: Failed to load template from s3.');
        } else {
            var templateBody = data.Body.toString();
            console.log("Template Body: " + templateBody);
            
            // Convert newlines in the message
            if (event.emailmessage !== null) {
                event.emailmessage = event.emailmessage
                .replace("\r\n", "<br />")
                .replace("\r", "<br />")
                .replace("\n", "<br />");
            }

            // Perform the substitutions
            var mark = require('markup-js');

            // Get ical-generator so we can create calendar invites on the fly
            var eventName = event.eventname ? event.eventname : "RightBrain Networks Live event",
                eventLocation = event.eventloc ? event.eventloc : "RightBrain Networks 305 E. Eisenhower Pkwy, Ann Arbor, MI 48108",
                eventDesc = event.eventdesc ? event.eventdesc : "Live RightBrain Networks Event";
            
            var ical = require('ical-generator'),
                cal = ical({domain: 'rightbrainnetworks.com', name: eventName});

            var newDate = new Date(parseInt(event.nbf * 1000)),
                endDate = new Date(parseInt(event.exp * 1000));

            cal.createEvent({
                start: newDate,
                end: endDate,
                summary: eventName,
                description: eventDesc,
                location: eventLocation
            });

            //lastly fix email since it got encoded
            event.email = decodeURIComponent(event.email);

            //Date
            //pack the timezone we need for momentjs
            moment.tz.add("America/Detroit|LMT CST EST EWT EPT EDT|5w.b 60 50 40 40 40|01234252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252525252|-2Cgir.N peqr.N 156L0 8x40 iv0 6fd0 11z0 Jy10 SL0 dnB0 1cL0 s10 1Vz0 1cN0 1cL0 1cN0 1fz0 1a10 1fz0 1cN0 1cL0 1cN0 1cL0 1cN0 1cL0 1cN0 1cL0 1cN0 1fz0 1a10 1fz0 1cN0 1cL0 1cN0 1cL0 1cN0 1cL0 14p0 1lb0 14p0 1nX0 11B0 1nX0 11B0 1nX0 14p0 1lb0 14p0 1lb0 14p0 1nX0 11B0 1nX0 11B0 1nX0 14p0 1lb0 14p0 1lb0 14p0 1lb0 14p0 1nX0 11B0 1nX0 11B0 1nX0 14p0 1lb0 14p0 1lb0 14p0 1nX0 11B0 1nX0 11B0 1nX0 Rd0 1zb0 Op0 1zb0 Op0 1zb0 Rd0 1zb0 Op0 1zb0 Op0 1zb0 Op0 1zb0 Op0 1zb0 Op0 1zb0 Rd0 1zb0 Op0 1zb0 Op0 1zb0 Op0 1zb0 Op0 1zb0 Rd0 1zb0 Op0 1zb0 Op0 1zb0 Op0 1zb0 Op0 1zb0 Op0 1zb0 Rd0 1zb0 Op0 1zb0 Op0 1zb0 Op0 1zb0 Op0 1zb0 Rd0 1zb0 Op0 1zb0 Op0 1zb0 Op0 1zb0 Op0 1zb0 Op0 1zb0|37e5");
            event.date = moment(newDate).tz("America/Detroit").format("dddd, MMMM Do YYYY, h:mm a");

            // Setup some variables to be used by params for SES email
            var subject = mark.up(event.emailsubject, event);
            console.log("Final subject: " + subject);
            
            var message = mark.up(templateBody, event);
            console.log("Final message: " + message);

            // Send the email
            var nodemailer = require('nodemailer'),
                sesTransport = require('nodemailer-ses-transport'),
                htmlToText = require('nodemailer-html-to-text').htmlToText;

            var transporter = nodemailer.createTransport(sesTransport({
                ses: ses
            }));
            
            var mailOptions = {
                from: config.fromAddress,
                to: event.name + ' <' + event.email + '>', // list of receivers
                subject: config.defaultSubject, // Subject line
                generateTextFromHTML: true,
                html: message, // html body
                icalEvent: {
                    // content can be a string, a buffer or a stream
                    // alternatively you could use `path` that points to a file or an url
                    content: cal.toString()
                }
            // send mail with defined transport object
            transporter.use('compile', htmlToText());
            transporter.sendMail(mailOptions, function(error, info){
                if(error){
                    console.log(error);
                    context.done("Something went wrong");
                }else{
                    console.log('Message sent: ' + JSON.stringify(info));
                    context.done(null, "Message sent successfully");
                }
            });
        }
    });
};
