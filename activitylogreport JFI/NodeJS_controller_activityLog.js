let fs = require('fs');
let mongoose = require('mongoose');
let Grid = require('gridfs-stream');
Grid.mongo = mongoose.mongo;
let gfs = new Grid(mongoose.connection.db);

let ActivityLog = require('../models/activityLog'),
    Activity = require('../models/activity'),
    EmailController = require('../controllers/emailCtrl');
    Event = require('../models/event'),
    SchedulingEvent = require('../models/schedulingEvent'),
    Status = require('../models/status'),
    Store = require('../models/store'),
    Project = require('../models/project'),
    SystemPreferences = require('../models/systemPreferences');

let moment = require('moment');

let Utilities = require('../utilities/utilities');


let ActivityLogController = function(){};


const removeScheduleEventsForProject = (projectId) => {
    let typesEnum = new SchedulingEvent().designateTypesEnum;

    Event.find({ project: projectId })
        .populate({
            path: 'schedulingEvent',
            model: 'schedulingEvent'
        })
        .exec()
        .then(events => {
            let typesEnumList = [typesEnum.scheduledEstimate, typesEnum.tentativelyScheduledEstimate];

            events.forEach(event =>  {
                // console.log("event being processed", event);

                if (typesEnumList.indexOf(event.schedulingEvent.designateType) >= 0) {
                    Event.findByIdAndRemove(event.id)
                        .exec()
                        .then()
                        .catch(err => console.log(err))
                }
            })

        });
};

ActivityLogController.prototype.read = function(req, res){
    res.json(req.activityLogs);
};


ActivityLogController.prototype.getNewActivityLogForType = function(req, res) {


    SystemPreferences.find({}).exec()
        .then(systemPreferences => {
            preferences = systemPreferences[0];
            return Activity.findOne({
                    projectType:req.params.projectType,
                    code: req.params.activityType
                })
                .populate({path:"status", model:"status"})
                .exec()
        })
        .then(activity => {

            let activityLog = new ActivityLog().toObject();
            activityLog.activity = activity;
            activityLog.preferences = preferences;
            res.json(activityLog);

        })

};


ActivityLogController.prototype.create = function(req, res){

    let activityLog = new ActivityLog(req.body);

    activityLog.save(function(err, newActivityLog) {
        if(err){
            console.log('Activity Log Creation Error', err);
        }
        res.json(newActivityLog);
    });

};

ActivityLogController.prototype.logAnActivity = function(req, res) {

    console.log("The body activity", req.body);
    let preferences = {};
    let noOfDays = null;
    let followUpDate = null;
    let status = null;
    let updatedProject = null;

    SystemPreferences.find({}).exec()
        .then(systemPreferences => {
            preferences = systemPreferences[0];
            return Activity.findById(req.body.activityID)
                .populate('status')
                .populate('nextStatus')
                .exec()
        })
        .then(activity => {

            if (activity) {
                status = activity.nextStatus ? activity.nextStatus : activity.status;
                if (activity.followUpDaysPreferenceProperty) {
                    noOfDays = preferences[activity.followUpDaysPreferenceProperty];
                } else {
                    noOfDays = 0;
                }

                if (status) {

                    console.log("followup date",req.body.assignedFollowUpDate);

                    if (status.hasStartDate && req.body.startDate) {
                        console.log("has start date");
                        followUpDate = moment(new Date(req.body.startDate)).add(noOfDays, 'days').toDate();
                    } else if (req.body.assignedFollowUpDate) {
                        console.log("assigned follow-up date");
                        followUpDate = new Date(req.body.assignedFollowUpDate);
                    } else if (activity.activityComplete) {
                        followUpDate = null;
                    } else {
                        console.log("calculated follow-up date");
                        followUpDate = moment(new Date()).add(noOfDays, 'days').toDate();
                    }

                    console.log("status", status);

                    return Project.findByIdAndUpdate(req.body.projectID,
                        {$set:  {'details.status': status,
                            'details.followUpDate': followUpDate,
                            'details.startDate': req.body.startDate,
                            'details.startTimeWindow': req.body.startTimeWindow
                        }, new: true})
                        .exec();
                }

            }

        })
        .then(project => {
            updatedProject = project;
            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            let activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.notes = req.body.notes;
            activityLog.followUp.date = followUpDate;
            activityLog.activity = req.body.activityID;
            activityLog.startDate = req.body.startDate;
            activityLog.startTimeWindow = req.body.startTimeWindow;
            activityLog.numberOfRefigures = req.body.numberOfRefigures;
            activityLog.notifiedTo = req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.statusName = statusName;

            if (req.body.documents) {
                activityLog.documents = req.body.documents;
            } else if (req.body.leadAssessment) {
                activityLog.documents.push(
                    {
                        type: req.body.leadAssessment.type,
                        fileID: req.body.leadAssessment.fileID,
                        fileName: req.body.leadAssessment.fileName
                    });
            }

            return activityLog.save().then(console.log("save!"));

            // let log = {
            //     activityLog: activityLog,
            //     project: project
            // };
            //
            // res.json({
            //     followUpDate: followUpDate,
            //     status: status,
            //     log: log
            // })
        }).then(newLog => {



            Activity.findById(newLog.activity.toString()).exec().then(newActivity => {

                console.log('the activity id',newActivity);

                ActivityLog.find({"project": req.body.projectID})
                    .populate({path: 'activity', model: 'activity'})
                    .exec()
                    .then(logs => {
                        logs.forEach(activityLog => {
                            console.log(activityLog.activity._id);
                            if (activityLog._id.toString() !== newLog._id.toString()
                                && newActivity.replacesActivities.indexOf(activityLog.activity._id.toString()) >= 0) {

                                activityLog.followUp.date = null;
                                activityLog.followUp.time = null;
                                activityLog.save();
                            }
                        });

                        console.log("yes?");
                        let log = {
                            activityLog: newLog,
                            project: updatedProject
                        };

                        res.json({
                            followUpDate: followUpDate,
                            status: status,
                            log: log
                        })
                    });
            });




        });


};

ActivityLogController.prototype.logEstimateSubmitActivity = function(req, res) {

    console.log('BE request body', req.body);


    let preferences = {};
    let followUpDate = null;
    let updatedProject = null;
    let status = null;
    let activityDoc = null;

    SystemPreferences.find({}).exec()
        .then(systemPreferences => {
            preferences = systemPreferences[0];
            return Activity.findById(req.body.activityID)
                .populate('status')
                .populate('nextStatus')
                .exec()
        })
        .then(activity => {
            status = activity.status;
            activityDoc = activity;

            if (req.body.emailStorePriorityNotification) {
                const projectId = req.body.projectID;
                const lastName = req.body.lastName;
                // let storeId = new mongoose.Types.ObjectId(req.body.storeId);
                const storeId = req.body.storeId;
                const storeProjectNumber = req.body.storeProjectNumber;

                let body = {};
                let storeContacts = [];

                // get all contacts from Store
                Store.findById(storeId)
                    .exec()
                    .then(store => {

                        // get contacts that receive priority notifications
                        const filteredContacts = store.contacts.filter(e => e.receivesPriorityNotifications === true);

                        filteredContacts.forEach(contact => {

                            let idx = storeContacts.findIndex(e => e.email.toLowerCase() === contact.email.toLowerCase());

                            // if unique email
                            if (idx < 0) {
                                storeContacts.push({
                                    email: contact.email
                                })
                            }
                        })

                        // loop through contacts
                        storeContacts.forEach(contact => {
                            body = {
                                projectId: projectId,
                                lastName: lastName,
                                storeProjectNumber: storeProjectNumber,
                                emailTo: contact.email
                            }

                            EmailController.priorityNotificationToStore(body);
                        })

                    })
                    .catch(error => {
                        console.log(error);
                    })
            }

            return Project.findByIdAndUpdate(req.body.projectID,
                {$set:  {'details.status': activity.status,
                    'details.primaryStatus': null,
                    'details.followUpDate': undefined,
                    'priorityEstimate' :req.body.priorityEstimate
                }, new: true})
                .exec();
        })
        .then(project => {
            updatedProject = project;
            updatedProject.details.primaryStatus = null;
            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            let activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.notes = req.body.notes;
            activityLog.followUp.date = undefined;
            activityLog.activity = req.body.activityID;
            activityLog.notifiedTo = req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.documents = req.body.documents;
            activityLog.priorityEstimate = req.body.priorityEstimate;
            activityLog.emailStorePriorityNotification = req.body.emailStorePriorityNotification;
            activityLog.statusName = statusName;
            return activityLog.save().then();

        }).then(newLog => {
            Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
                ActivityLog.find({"project": req.body.projectID})
                    .populate({path: 'activity', model: 'activity'})
                    .exec()
                    .then(logs => {
                        logs.forEach(activityLog => {
                            if (activityLog._id.toString() !== newLog._id.toString()
                                && newActivity.replacesActivities.indexOf(activityLog.activity._id.toString()) >= 0) {

                                activityLog.followUp.date = null;
                                activityLog.followUp.time = null;
                                activityLog.save();
                            }
                        });

                        let log = {
                            activityLog: newLog,
                            project: updatedProject
                        };

                        res.json({
                            followUpDate: null,
                            removeFollowUpDate: true,
                            priorityEstimate: req.body.priorityEstimate,
                            status: status,
                            activity: activityDoc,
                            log: log
                        })
                    });
            });
    });
};

ActivityLogController.prototype.logInstallSubmitActivity = function(req, res) {

    console.log('BE request body', req.body);


    let preferences = {};
    let followUpDate = null;
    let updatedProject = null;
    let status = null;
    let activityDoc = null

    SystemPreferences.find({}).exec()
        .then(systemPreferences => {
            preferences = systemPreferences[0];
            return Activity.findById(req.body.activityID)
                .populate('status')
                .populate('nextStatus')
                .exec()
        })
        .then(activity => {
            status = activity.status;
            activityDoc = activity;

            if (req.body.emailStorePriorityNotification) {
                const projectId = req.body.projectID;
                const lastName = req.body.lastName;
                // let storeId = new mongoose.Types.ObjectId(req.body.storeId);
                const storeId = req.body.storeId;
                const storeProjectNumber = req.body.storeProjectNumber;

                let body = {};
                let storeContacts = [];

                // get all contacts from Store
                Store.findById(storeId)
                    .exec()
                    .then(store => {

                        // get contacts that receive priority notifications
                        const filteredContacts = store.contacts.filter(e => e.receivesPriorityNotifications === true);

                        filteredContacts.forEach(contact => {

                            let idx = storeContacts.findIndex(e => e.email.toLowerCase() === contact.email.toLowerCase());

                            // if unique email
                            if (idx < 0) {
                                storeContacts.push({
                                    email: contact.email
                                })
                            }
                        })

                        // loop through contacts
                        storeContacts.forEach(contact => {
                            body = {
                                projectId: projectId,
                                lastName: lastName,
                                storeProjectNumber: storeProjectNumber,
                                emailTo: contact.email
                            }

                            EmailController.priorityNotificationToStore(body);
                        })

                    })
                    .catch(error => {
                        console.log(error);
                    })
            }

            return Project.findByIdAndUpdate(req.body.projectID,
                {$set:  {'details.status': activity.status,
                    'details.primaryStatus': null,
                    'details.followUpDate': followUpDate,
                    'priorityInstall' :req.body.priorityInstall
                }, new: true})
                .exec();
        })
        .then(project => {
            updatedProject = project;
            updatedProject.details.primaryStatus = null;
            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            let activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.notes = req.body.notes;
            activityLog.followUp.date = followUpDate;
            activityLog.activity = req.body.activityID;
            activityLog.notifiedTo = req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.documents = req.body.documents;
            activityLog.priorityInstall = req.body.priorityInstall;
            activityLog.emailStorePriorityNotification = req.body.emailStorePriorityNotification;
            activityLog.statusName = statusName;
            return activityLog.save().then();

        }).then(newLog => {
            Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
                ActivityLog.find({"project": req.body.projectID})
                    .populate({path: 'activity', model: 'activity'})
                    .exec()
                    .then(logs => {
                        logs.forEach(activityLog => {
                            if (activityLog._id.toString() !== newLog._id.toString()
                                && newActivity.replacesActivities.indexOf(activityLog.activity._id.toString()) >= 0) {

                                activityLog.followUp.date = null;
                                activityLog.followUp.time = null;
                                activityLog.save();
                            }
                        });

                        let log = {
                            activityLog: newLog,
                            project: updatedProject
                        };

                        res.json({
                            followUpDate: followUpDate,
                            removeFollowUpDate: !followUpDate,
                            priorityInstall: req.body.priorityInstall,
                            status: status,
                            activity: activityDoc,
                            log: log
                        })
                    });
            });
    });
};

ActivityLogController.prototype.logAttemptToSellActivity = function(req, res) {

    console.log("Attempt to sell req.body", req.body);

    let preferences = {};
    let followUpDate = null;
    let updatedProject = null;
    let status = null;
    let activityDoc = null;

    Activity.findById(req.body.activityID)
        .populate('status')
        .populate('nextStatus')
        .exec()
        .then(activity => {
            status = activity.status;
            activityDoc = activity;
            return Project.findByIdAndUpdate(req.body.projectID,
                {$set:  {'details.status': activity.status,
                    'details.primaryStatus': activity.status,
                    'details.lastStatus' : req.body.lastStatus,
                    'details.followUpDate': req.body.followUp.date,
                    'details.followUpdate': req.body.followUp.time
                }, new: true})
                .exec();
        })
        .then(project => {
            updatedProject = project;
            updatedProject.details.primaryStatus = activityDoc.status;
            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            let activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.notes = req.body.notes;
            activityLog.followUp.date = req.body.followUp.date;
            activityLog.followUp.time = req.body.followUp.time;
            activityLog.activity = req.body.activityID;
            activityLog.documents = req.body.documents;
            activityLog.statusName = statusName;
            return activityLog.save().then();

        }).then(newLog => {
            Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
                ActivityLog.find({"project": req.body.projectID})
                    .populate({path: 'activity', model: 'activity'})
                    .exec()
                    .then(logs => {
                        logs.forEach(activityLog => {
                            if (activityLog._id.toString() !== newLog._id.toString()
                                && newActivity.replacesActivities.indexOf(activityLog.activity._id.toString()) >= 0) {

                                activityLog.followUp.date = null;
                                activityLog.followUp.time = null;
                                activityLog.save();
                            }
                        });

                        let log = {
                            activityLog: newLog,
                            project: updatedProject
                        };

                        res.json({
                            followUpDate: req.body.followUp.date,
                            status: status,
                            log: log
                        })
            });
        });
    });

};

ActivityLogController.prototype.logEstimateCreateActivity = function(req, res) {

    let updatedProject = null;
    let status = null;
    let activityDoc = null;
    let tentativeStartDate = req.body.tentativeStartDate ?
        new Date(req.body.tentativeStartDate) : null;

    let tentativeStartTimeFrom = req.body.tentativeStartTimeWindow.from ?
        new Date(req.body.tentativeStartTimeWindow.from) : null;

    let tentativeStartTimeTo = req.body.tentativeStartTimeWindow.to ?
        new Date(req.body.tentativeStartTimeWindow.to) : null;


    console.log('estimate created activity log body', req.body);
    console.log('followup time',req.body.followUp.time);



    if (tentativeStartDate) {
        Activity.findOne({'code': 'tentativelyScheduled', 'projectType': 'Estimate'})
            .populate('status')
            .populate('nextStatus')
            .exec()
            .then(activity => {
                status = activity.status;
                activityDoc = activity;
                return Project.findByIdAndUpdate(req.body.projectID,
                    {$set:  {'details.status': activity.status,
                        'details.primaryStatus': activity.status,
                        'details.followUpDate': req.body.followUp.date,
                        'details.followUpTime' : req.body.followUp.time,
                        'details.tentativeStartDate': tentativeStartDate,
                        'details.tentativeStartTimeWindow.from': tentativeStartTimeFrom,
                        'details.tentativeStartTimeWindow.to': tentativeStartTimeTo
                    }, new: true})
                    .exec();
            })
            .then(project => {
                updatedProject = project;
                updatedProject.details.primaryStatus = activityDoc.status;
                let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
                let activityLog = new ActivityLog();
                activityLog.activityDate = new Date();
                activityLog.project = req.body.projectID;
                activityLog.user = req.body.userID;
                activityLog.notifiedBy = req.body.notifiedBy;
                activityLog.notes = req.body.notes;
                activityLog.notifiedTo= req.body.notifiedTo;
                activityLog.notifiedToNotes = req.body.notifiedToNotes;
                activityLog.followUp.date = req.body.followUp.date;
                activityLog.followUp.time = req.body.followUp.time;
                activityLog.activity = req.body.activityID;
                activityLog.tentativeStartDate = tentativeStartDate;
                activityLog.tentativeStartTimeWindow.from = tentativeStartTimeFrom;
                activityLog.tentativeStartTimeWindow.to = tentativeStartTimeTo;
                activityLog.tentativeAppointmentDurationHours = req.body.tentativeAppointmentDurationHours;
                activityLog.tentativeAppointmentDurationMinutes = req.body.tentativeAppointmentDurationMinutes;
                activityLog.documents = req.body.documents;
                activityLog.statusName = statusName;
                return activityLog.save().then();

            }).then(newLog => {

                let log = {
                    activityLog: newLog,
                    project: updatedProject
                };

                res.json({
                    followUpDate: req.body.followUp.date,
                    status: status,
                    primaryStatus: status,
                    activity: activityDoc,
                    log: log
                })
            });

    } else {

        Activity.findById(req.body.activityID)
            .populate('status')
            .populate('nextStatus')
            .exec()
            .then(activity => {
                status = activity.status;
                activityDoc = activity;
                return Project.findByIdAndUpdate(req.body.projectID,
                    {
                        $set: {
                            'details.status': activity.status,
                            'details.followUpDate': req.body.followUp.date,
                            'details.followUpTime': req.body.followUp.time
                        }, new: true
                    })
                    .exec();
            })
            .then(project => {
                updatedProject = project;
                let activityLog = new ActivityLog();
                activityLog.activityDate = new Date();
                activityLog.project = req.body.projectID;
                activityLog.user = req.body.userID;
                activityLog.notifiedBy = req.body.notifiedBy;
                activityLog.notes = req.body.notes;
                activityLog.notifiedTo = req.body.notifiedTo;
                activityLog.notifiedToNotes = req.body.notifiedToNotes;
                activityLog.followUp.date = req.body.followUp.date;
                activityLog.followUp.time = req.body.followUp.time;
                activityLog.activity = req.body.activityID;
                activityLog.documents = req.body.documents;
                return activityLog.save().then();

            })
            .then(newLog => {
                Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
                    let log = {
                        activityLog: newLog,
                        project: updatedProject
                    };
                    res.json({
                        followUpDate: req.body.followUp.date,
                        status: status,
                        activity: activityDoc,
                        log: log

                    })
                });
            });
    }
};

ActivityLogController.prototype.logInstallCreateActivity = function(req, res) {

    let updatedProject = null;
    let status = null;
    let activityDoc = null;
    let tentativeStartDate = req.body.tentativeStartDate ?
        new Date(req.body.tentativeStartDate) : null;

    let tentativeStartTimeFrom = req.body.tentativeStartTimeWindow.from ?
        new Date(req.body.tentativeStartTimeWindow.from) : null;

    let tentativeStartTimeTo = req.body.tentativeStartTimeWindow.to ?
        new Date(req.body.tentativeStartTimeWindow.to) : null;


    console.log('install created activity log body', req.body);
    console.log('followup time',req.body.followUp.time);



    if (tentativeStartDate) {
        Activity.findOne({'code': 'tentativelyScheduled', 'projectType': 'Install'})
            .populate('status')
            .populate('nextStatus')
            .exec()
            .then(activity => {
                status = activity.status;
                activityDoc = activity;
                return Project.findByIdAndUpdate(req.body.projectID,
                    {$set:  {'details.status': activity.status,
                        'details.primaryStatus': activity.status,
                        'details.followUpDate': req.body.followUp.date,
                        'details.followUpTime' : req.body.followUp.time,
                        'details.tentativeStartDate': tentativeStartDate,
                        'details.tentativeStartTimeWindow.from': tentativeStartTimeFrom,
                        'details.tentativeStartTimeWindow.to': tentativeStartTimeTo
                    }, new: true})
                    .exec();
            })
            .then(project => {
                updatedProject = project;
                updatedProject.details.primaryStatus = activityDoc.status;
                let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
                let activityLog = new ActivityLog();
                activityLog.activityDate = new Date();
                activityLog.project = req.body.projectID;
                activityLog.user = req.body.userID;
                activityLog.notifiedBy = req.body.notifiedBy;
                activityLog.notes = req.body.notes;
                activityLog.notifiedTo= req.body.notifiedTo;
                activityLog.notifiedToNotes = req.body.notifiedToNotes;
                activityLog.followUp.date = req.body.followUp.date;
                activityLog.followUp.time = req.body.followUp.time;
                activityLog.activity = req.body.activityID;
                activityLog.tentativeStartDate = tentativeStartDate;
                activityLog.tentativeStartTimeWindow.from = tentativeStartTimeFrom;
                activityLog.tentativeStartTimeWindow.to = tentativeStartTimeTo;
                activityLog.tentativeAppointmentDurationHours = req.body.tentativeAppointmentDurationHours;
                activityLog.tentativeAppointmentDurationMinutes = req.body.tentativeAppointmentDurationMinutes;
                activityLog.documents = req.body.documents;
                activityLog.statusName = statusName;
                return activityLog.save().then();

            }).then(newLog => {

                let log = {
                    activityLog: newLog,
                    project: updatedProject
                };

                res.json({
                    followUpDate: req.body.followUp.date,
                    status: status,
                    primaryStatus: status,
                    activity: activityDoc,
                    log: log
                })
            });

    } else {

        Activity.findById(req.body.activityID)
            .populate('status')
            .populate('nextStatus')
            .exec()
            .then(activity => {
                status = activity.status;
                activityDoc = activity;
                return Project.findByIdAndUpdate(req.body.projectID,
                    {
                        $set: {
                            'details.status': activity.status,
                            'details.followUpDate': req.body.followUp.date,
                            'details.followUpTime': req.body.followUp.time
                        }, new: true
                    })
                    .exec();
            })
            .then(project => {
                updatedProject = project;
                let activityLog = new ActivityLog();
                activityLog.activityDate = new Date();
                activityLog.project = req.body.projectID;
                activityLog.user = req.body.userID;
                activityLog.notifiedBy = req.body.notifiedBy;
                activityLog.notes = req.body.notes;
                activityLog.notifiedTo = req.body.notifiedTo;
                activityLog.notifiedToNotes = req.body.notifiedToNotes;
                activityLog.followUp.date = req.body.followUp.date;
                activityLog.followUp.time = req.body.followUp.time;
                activityLog.activity = req.body.activityID;
                activityLog.documents = req.body.documents;
                return activityLog.save().then();

            })
            .then(newLog => {
                Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
                    let log = {
                        activityLog: newLog,
                        project: updatedProject
                    };
                    res.json({
                        followUpDate: req.body.followUp.date,
                        status: status,
                        activity: activityDoc,
                        log: log

                    })
                });
            });
    }
};



ActivityLogController.prototype.logMessageActivity = function(req, res) {

    let updatedProject = null;
    let status = null;

    Activity.findById(req.body.activityID)
        .populate('status')
        .populate('nextStatus')
        .exec()
        .then(activity => {
            status = activity.status;
            return Project.findByIdAndUpdate(req.body.projectID,
                {$set:  {'details.status': activity.status,
                    'details.followUpDate': req.body.followUp.date,
                    'details.followUpTime': req.body.followUp.time
                }, new: true})
                .populate({
                    path: "details.primaryStatus",
                    model: "status"
                })
                .exec();
        })
        .then(project => {
            updatedProject = project;
            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            let activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.notifiedBy = req.body.notifiedBy;
            activityLog.notes = req.body.notes;
            activityLog.notifiedTo= req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.followUp.date = req.body.followUp.date;
            activityLog.followUp.time = req.body.followUp.time;
            activityLog.activity = req.body.activityID;
            activityLog.documents = req.body.documents;
            activityLog.statusName = statusName;
            return activityLog.save().then();

        }).then(newLog => {
        Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
            ActivityLog.find({"project": req.body.projectID})
                .populate({path: 'activity', model: 'activity'})
                .exec()
                .then(logs => {
                    logs.forEach(activityLog => {
                        if (activityLog._id.toString() !== newLog._id.toString()
                            && newActivity.replacesActivities.indexOf(activityLog.activity._id.toString()) >= 0) {

                            activityLog.followUp.date = null;
                            activityLog.followUp.time = null;
                            activityLog.save();
                        }
                    });

                    let log = {
                        activityLog: newLog,
                        project: updatedProject
                    };

                    res.json({
                        followUpDate: req.body.followUp.date,
                        status: status,
                        log: log
                    })
                });
        });
    });

};

ActivityLogController.prototype.logCustomerCallActivity = function(req, res) {

    console.log('call activity', req.body);

    let updatedProject = null;
    let status = null;
    let undefinedWindow = {
        from: undefined,
        to: undefined
    }

    Activity.findById(req.body.activityID)
        .populate('status')
        .populate('nextStatus')
        .exec()
        .then(activity => {
            status = activity.status;

            removeScheduleEventsForProject(req.body.projectID);

            return Project.findByIdAndUpdate(req.body.projectID,
                {$set: {
                    'details.status': activity.status,
                    'details.followUpDate': req.body.followUp.date,
                    'details.followUpTime': req.body.followUp.time,
                    'details.primaryStatus': null,
                    'details.startDate': undefined,
                    'details.startTimeWindow': undefinedWindow,
                    'details.tentativeStartDate': undefined,
                    'details.tentativeStartTimeWindow': undefinedWindow
                }, new: true})
                .populate({
                    path: "details.primaryStatus",
                    model: "status"
                })
                .exec();
        })
        .then(project => {
            updatedProject = project;
            updatedProject.details.primaryStatus = null;
            updatedProject.details.tentativeStartDate = undefined;
            updatedProject.details.tentativeStartTimeWindow = undefinedWindow;
            updatedProject.details.startDate = undefined;
            updatedProject.details.startTimeWindow = undefinedWindow;
            // console.log('updateProject', updatedProject);
            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            let activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.notifiedBy = req.body.notifiedBy;
            activityLog.notes = req.body.notes;
            activityLog.notifiedTo= req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.followUp.date = req.body.followUp.date;
            activityLog.followUp.time = req.body.followUp.time;
            activityLog.sendToEstimator = req.body.sendToEstimator;
            activityLog.activity = req.body.activityID;
            activityLog.documents = req.body.documents;
            activityLog.statusName = statusName;
            return activityLog.save().then();

        }).then(newLog => {
        Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
            ActivityLog.find({"project": req.body.projectID})
                .populate({path: 'activity', model: 'activity'})
                .exec()
                .then(logs => {
                    logs.forEach(activityLog => {
                        if (activityLog._id.toString() !== newLog._id.toString()
                            && newActivity.replacesActivities.indexOf(activityLog.activity._id.toString()) >= 0) {

                            activityLog.followUp.date = null;
                            activityLog.followUp.time = null;
                            activityLog.save();
                        }
                    });

                    let log = {
                        activityLog: newLog,
                        project: updatedProject
                    };

                    res.json({
                        followUpDate: req.body.followUp.date,
                        followUpTime: req.body.followUp.time,
                        status: status,
                        log: log
                    })
                });
        });
    });

};


ActivityLogController.prototype.logScheduleActivity = function(req, res) {

    let updatedProject = null;
    let status = null;

    console.log("scheduled log req.body", req.body);

    Activity.findById(req.body.activityID)
        .populate('status')
        .populate('nextStatus')
        .exec()
        .then(activity => {
            status = activity.status;

            if (req.body.updateScheduleEstimates) {
                return Project.findByIdAndUpdate(req.body.projectID,
                    {$set:  {'hasEverBeenScheduled': true,
                        'details.status': activity.status,
                        'details.followUpDate': req.body.followUp.date,
                        'details.followUpTime': req.body.followUp.time,
                        'details.startDate': req.body.startDate,
                        'details.startTimeWindow': req.body.startTimeWindow,
                        'details.endDate': req.body.endDate,
                        'details.surfaceType': req.body.surfaceType,
                        'details.timeframe': req.body.timeframe,
                        'details.budget': req.body.budget,
                        'details.whereHearAboutUs': req.body.whereHearAboutUs,
                        'details.tentativeStartDate': undefined,
                        'details.tentativeStartTimeWindow.from': undefined,
                        'details.tentativeStartTimeWindow.to': undefined
                    }, new: true})
                    .exec();
            } else {
                return Project.findByIdAndUpdate(req.body.projectID,
                    {$set:  {'hasEverBeenScheduled': true,
                        'details.status': activity.status,
                        'details.followUpDate': req.body.followUp.date,
                        'details.followUpTime': req.body.followUp.time,
                        'details.startDate': req.body.startDate,
                        'details.startTimeWindow': req.body.startTimeWindow,
                        'details.endDate': req.body.endDate,
                        'details.tentativeStartDate': undefined,
                        'details.tentativeStartTimeWindow.from': undefined,
                        'details.tentativeStartTimeWindow.to': undefined
                    }, new: true})
                    .exec();
            }
        })
        .then(project => {
            updatedProject = project;
            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            let activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.notifiedBy = req.body.notifiedBy;
            activityLog.notes = req.body.notes;
            activityLog.notifiedTo= req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.followUp.date = req.body.followUp.date;
            activityLog.activity = req.body.activityID;
            activityLog.startDate = req.body.startDate;
            activityLog.startTimeWindow = req.body.startTimeWindow;
            activityLog.endDate = req.body.endDate;
            activityLog.documents = req.body.documents;
            activityLog.perCustomer = req.body.perCustomer;
            activityLog.soonerIfPossible = req.body.soonerIfPossible;
            activityLog.appointmentDurationHours = req.body.durationHours;
            activityLog.appointmentDurationMinutes = req.body.durationMinutes;
            activityLog.statusName = statusName;

            return activityLog.save().then();

        }).then(newLog => {
        Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
            ActivityLog.find({"project": req.body.projectID})
                .populate({path: 'activity', model: 'activity'})
                .exec()
                .then(logs => {
                    logs.forEach(activityLog => {
                        if (activityLog._id.toString() !== newLog._id.toString()
                            && newActivity.replacesActivities.indexOf(activityLog.activity._id.toString()) >= 0) {

                            activityLog.followUp.date = null;
                            activityLog.followUp.time = null;
                            activityLog.save();
                        }
                    });

                    Activity.find({'_id': { $in: status.nextAvailableActivities}})
                        .populate("status")
                        .sort({sequence: 1})
                        .then(activities => {

                            let log = {
                                activityLog: newLog,
                                project: updatedProject
                            };

                            res.json({
                                followUpDate: req.body.followUp.date,
                                status: status,
                                availableActivities: activities,
                                log: log
                            })

                        })


                });
        });
    });

};

ActivityLogController.prototype.logTentativelyScheduledActivity = function(req, res) {

    let updatedProject = null;
    let status = null;

    console.log('tentative request body', req.body);

    Activity.findById(req.body.activityID)
        .populate('status')
        .populate('nextStatus')
        .exec()
        .then(activity => {
            status = activity.status;

            if (req.body.updateScheduleEstimates) {
                return Project.findByIdAndUpdate(req.body.projectID,
                    {$set:  {'details.status': activity.status,
                         'details.followUpDate': req.body.followUp.date,
                        'details.followUpTime': req.body.followUp.time,
                        'details.surfaceType': req.body.surfaceType,
                        'details.timeframe': req.body.timeframe,
                        'details.budget': req.body.budget,
                        'details.whereHearAboutUs': req.body.whereHearAboutUs,
                        'details.tentativeStartDate': req.body.startDate,
                        'details.tentativeStartTimeWindow': req.body.startTimeWindow
                    }, new: true})
                    .exec();
            } else {
                return Project.findByIdAndUpdate(req.body.projectID,
                    {$set:  {'details.status': activity.status,
                        'details.followUpDate': req.body.followUp.date,
                        'details.followUpTime': req.body.followUp.time,
                        'details.tentativeStartDate': req.body.startDate,
                        'details.tentativeStartTimeWindow': req.body.startTimeWindow
                    }, new: true})
                    .exec();
            }
        })
        .then(project => {
            updatedProject = project;
            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            let activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.notifiedBy = req.body.notifiedBy;
            activityLog.notes = req.body.notes;
            activityLog.notifiedTo= req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.followUp.date = req.body.followUp.date;
            activityLog.activity = req.body.activityID;
            activityLog.documents = req.body.documents;
            activityLog.perCustomer = req.body.perCustomer;
            activityLog.soonerIfPossible = req.body.soonerIfPossible;
            activityLog.tentativeStartDate = req.body.startDate;
            activityLog.tentativeAppointmentDurationHours = req.body.appointmentDurationHours;
            activityLog.tentativeAppointmentDurationMinutes = req.body.appointmentDurationMinutes;
            activityLog.tentativeStartTimeWindow = req.body.startTimeWindow;
            activityLog.statusName = statusName;

            return activityLog.save().then();

        }).then(newLog => {
        Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
            ActivityLog.find({"project": req.body.projectID})
                .populate({path: 'activity', model: 'activity'})
                .exec()
                .then(logs => {
                    logs.forEach(activityLog => {
                        if (activityLog._id.toString() !== newLog._id.toString()
                            && newActivity.replacesActivities.indexOf(activityLog.activity._id.toString()) >= 0) {

                            activityLog.followUp.date = null;
                            activityLog.followUp.time = null;
                            activityLog.save();
                        }
                    });

                    Activity.find({'_id': { $in: status.nextAvailableActivities}})
                        .populate("status")
                        .sort({sequence: 1})
                        .then(activities => {

                            let log = {
                                activityLog: newLog,
                                project: updatedProject
                            };

                            res.json({
                                followUpDate: req.body.followUp.date,
                                status: status,
                                availableActivities: activities,
                                log: log
                            })

                        })


                });
        });
    });

};

ActivityLogController.prototype.logCancelledActivity = function(req, res) {

    console.log("cancel req.body", req.body)

    let updatedProject = null;
    let status = null;
    let cancelActivity = null;
    let nextStatus = null;
    let nextStatusId = null;
    let primaryStatus = req.body.lastPrimaryStatus ? req.body.lastPrimaryStatus : null;

    let undefinedWindow = {
        from: undefined,
        to: undefined
    }

    Activity.findById(req.body.activityID)
        .populate('status')
        .exec()
        .then(activity => {

            // if (!primaryStatus) {

                nextStatus = req.body.lastStatus ? req.body.lastStatus : activity.status;
                nextStatusId = req.body.lastStatus ? req.body.lastStatus : null;
            // } else {
            //     nextStatus = primaryStatus;
            //     nextStatusId = primaryStatus;
            // }

            status = nextStatus;
            cancelActivity = activity;

            console.log('next status', nextStatus);
            console.log('next status id', nextStatusId);
            console.log("last primary", req.body.lastPrimaryStatus);

            removeScheduleEventsForProject(req.body.projectID);


            if (req.body.lastPrimaryStatus) {
                return Project.findByIdAndUpdate(req.body.projectID,
                    {$set:  {'details.status': nextStatus,
                        'details.primaryStatus' : primaryStatus,
                        'details.followUpDate': req.body.followUp.date,
                        'details.followUpTime': req.body.followUp.time
                    }, new: true})
                    .exec();
            } else {
                return Project.findByIdAndUpdate(req.body.projectID,
                    {$set:  {'details.status': nextStatus,
                        'details.primaryStatus' : primaryStatus,
                        'details.startDate': undefined,
                        'details.startTimeWindow': undefinedWindow,
                        'details.tentativeStartDate': undefined,
                        'details.tentativeStartTimeWindow': undefinedWindow,
                        'details.followUpDate': undefined,
                        'details.followUpTime': undefined
                    }, new: true})
                    .exec()

            }


        })
        .then(project => {
            updatedProject = project;
            updatedProject.details.primaryStatus = primaryStatus;

            if (!req.body.lastPrimaryStatus) {
                updatedProject.details.startDate = null;
            }

            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            let activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.notifiedBy = req.body.notifiedBy;
            activityLog.notes = req.body.notes;
            activityLog.notifiedTo = req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.sendToEstimator = req.body.sendToEstimator;
            activityLog.followUp.date = req.body.followUp.date;
            activityLog.followUp.time = req.body.followUp.time;
            activityLog.activity = req.body.activityID;
            activityLog.startTimeWindow.lateArrival= req.body.lateArrival;
            activityLog.documents = req.body.documents;
            activityLog.statusName = statusName;
            return activityLog.save().then();

        }).then(newLog => {
        Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
            ActivityLog.find({"project": req.body.projectID})
                .populate({path: 'activity', model: 'activity'})
                .exec()
                .then(logs => {
                    logs.forEach(activityLog => {
                        if (activityLog._id.toString() !== newLog._id.toString()
                            && newActivity.replacesActivities.indexOf(activityLog.activity._id.toString()) >= 0) {

                            activityLog.followUp.date = null;
                            activityLog.followUp.time = null;
                            activityLog.save();
                        }
                    });


                    if (primaryStatus) {

                        console.log('end at p status')
                        Status.findById(primaryStatus).exec()
                            .then(statusDoc =>  {

                                updatedProject.primaryStatus = statusDoc;
                                updatedProject.status = statusDoc;
                                let log = {
                                    activityLog: newLog,
                                    project: updatedProject
                                };

                                res.json({
                                    followUpDate: req.body.followUp.date,
                                    removeFollowUpDate: true,
                                    status: statusDoc,
                                    activity: cancelActivity,
                                    availableActivities: [],
                                    log: log
                                })

                            })
                    } else if (nextStatusId && nextStatusId !== null) {

                        console.log('end at next status')
                        Status.findById(nextStatusId).exec()
                            .then(statusDoc =>  {

                                console.log('next status statusDoc', statusDoc);

                                let log = {
                                    activityLog: newLog,
                                    project: updatedProject
                                };

                                res.json({
                                    followUpDate: req.body.followUp.date,
                                    removeFollowUpDate: true,
                                    status: statusDoc,
                                    activity: cancelActivity,
                                    availableActivities: [],
                                    log: log
                                })

                            })
                    } else {

                        console.log('end at else')

                        let log = {
                            activityLog: newLog,
                            project: updatedProject
                        };

                        res.json({
                            followUpDate: req.body.followUp.date,
                            status: nextStatus,
                            removeFollowUpDate: true,
                            activity: cancelActivity,
                            availableActivities: [],
                            log: log
                        })

                    }


                });
        });
    });

};

ActivityLogController.prototype.logNoShowActivity = function(req, res) {

    let updatedProject = null;
    let status = null;
    let activityDoc = null;

    Activity.findById(req.body.activityID)
        .populate('status')
        .populate('nextStatus')
        .exec()
        .then(activity => {
            status = activity.nextStatus;
            activityDoc = activity;

            removeScheduleEventsForProject(req.body.projectID);

            return Project.findByIdAndUpdate(req.body.projectID,
                {$set:  {'details.status': activity.status,
                    'details.primaryStatus': activity.status,
                    'details.followUpDate': req.body.followUp.date,
                    'details.followUpTime': req.body.followUp.time
                }, new: true})
                .exec();
        })
        .then(project => {
            updatedProject = project;
            updatedProject.details.primaryStatus = activityDoc.status;
            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            let activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.notifiedBy = req.body.notifiedBy;
            activityLog.notes = req.body.notes;
            activityLog.notifiedTo = req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.followUp.date = req.body.followUp.date;
            activityLog.followUp.time = req.body.followUp.time;
            activityLog.activity = req.body.activityID;
            activityLog.startTimeWindow.lateArrival= req.body.lateArrival;
            activityLog.documents = req.body.documents;
            activityLog.statusName = statusName;
            return activityLog.save().then();

        }).then(newLog => {
        Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
            ActivityLog.find({"project": req.body.projectID})
                .populate({path: 'activity', model: 'activity'})
                .exec()
                .then(logs => {
                    logs.forEach(activityLog => {
                        if (activityLog._id.toString() !== newLog._id.toString()
                            && newActivity.replacesActivities.indexOf(activityLog.activity._id.toString()) >= 0) {

                            activityLog.followUp.date = null;
                            activityLog.followUp.time = null;
                            activityLog.save();
                        }
                    });

                    Activity.find({'_id': { $in: status.nextAvailableActivities}})
                        .sort({sequence: 1})
                        .then(activities => {

                            let log = {
                                activityLog: newLog,
                                project: updatedProject
                            };

                            res.json({
                                followUpDate: req.body.followUp.date,
                                status: status,
                                availableActivities: activities,
                                log: log
                            })

                        })


                });
        });
    });

};


ActivityLogController.prototype.logChangeOfLaborPOOrPayActivity = (req, res) => {

    let updatedProject = null;
    let activityDoc = null;
    let status = null;

    console.log('change of labor, po, or pay activity log body', req.body);

    Activity.findById(req.body.activityID)
        .populate('status')
        .populate('nextStatus')
        .exec()
        .then(activity => {
            activityDoc = activity;
            status = activity.status;

            if (req.body.followUp.date) {
                return Project.findByIdAndUpdate(req.body.projectID,
                    {
                        $set: {
                            'details.followUpDate': req.body.followUp.date,
                            'details.followUpTime': req.body.followUp.time
                        }, new: true
                    })
                    .exec();
            } else {
                return Project.findById(req.body.projectID)
                    .exec();
            }

        })
        .then(project => {
            updatedProject = project;

            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            const activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.quoteNumber = req.body.quoteNumber;
            activityLog.quoteName = req.body.quoteName;
            activityLog.notifiedBy = req.body.notifiedBy;
            activityLog.notes = req.body.notes;
            activityLog.notifiedTo = req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.sendToEstimator = req.body.sendToEstimator;
            activityLog.followUp.date = req.body.followUp.date;
            activityLog.followUp.time = req.body.followUp.time;
            activityLog.activity = req.body.activityID;
            activityLog.documents = req.body.documents;
            activityLog.statusName = statusName;
            return activityLog.save().then();
        })
        .then(newLog => {
            Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
                let log = {
                    activityLog: newLog,
                    project: updatedProject
                };
                res.json({
                    followUpDate: req.body.followUp.date,
                    followUpTime: req.body.followUp.time,
                    activity: activityDoc,
                    log: log
                })
            });
        });
    };


ActivityLogController.prototype.logCheckInForReviewActivity = function(req, res) {

    console.log('checkin body', req.body);

    let updatedProject = null;
    let status = null;

    Activity.findById(req.body.activityID)
        .populate('status')
        .populate('nextStatus')
        .exec()
        .then(activity => {
            status = activity.status;

            return Project.findByIdAndUpdate(req.body.projectID,
                {$set:  {
                    'details.status': activity.status,
                    'details.primaryStatus': null,
                    'details.noOfRefigures': req.body.numberOfRefigures,
                    'priorityEstimate': req.body.priorityEstimate
                    }, new: true})
                .exec();
        })
        .then(project => {
            updatedProject = project;
            updatedProject.details.primaryStatus = null;
            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            let activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.notifiedBy = req.body.notifiedBy;
            activityLog.notes = req.body.notes;
            activityLog.notifiedTo= req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.followUp.date = req.body.followUp.date;
            activityLog.numberOfRefigures = req.body.numberOfRefigures;
            activityLog.activity = req.body.activityID;
            activityLog.documents = req.body.documents;
            activityLog.priorityEstimate = req.body.priorityEstimate;
            activityLog.statusName = statusName;
            return activityLog.save().then();

        }).then(newLog => {
        Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
            ActivityLog.find({"project": req.body.projectID})
                .populate({path: 'activity', model: 'activity'})
                .exec()
                .then(logs => {
                    logs.forEach(activityLog => {
                        if (activityLog._id.toString() !== newLog._id.toString()
                            && newActivity.replacesActivities.indexOf(activityLog.activity._id.toString()) >= 0) {

                            activityLog.followUp.date = null;
                            activityLog.followUp.time = null;
                            activityLog.save();
                        }
                    });

                    let log = {
                        activityLog: newLog,
                        project: updatedProject
                    };

                    res.json({
                        followUpDate: req.body.followUp.date,
                        status: status,
                        priorityEstimate: req.body.priorityEstimate,
                        log: log
                    })
                });
        });
    });

};


ActivityLogController.prototype.logOtherActivity = (req, res) => {

    let updatedProject = null;
    let activityDoc = null;
    let status = null;

    console.log('other activity log body', req.body);

    Activity.findById(req.body.activityID)
        .populate('status')
        .populate('nextStatus')
        .exec()
        .then(activity => {
            activityDoc = activity;
            status = activity.status;

            return Project.findById(req.body.projectID)
                .exec();
        })
        .then(project => {
            updatedProject = project;

            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            const activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.quoteNumber = req.body.quoteNumber;
            activityLog.quoteName = req.body.quoteName;
            activityLog.notifiedBy = req.body.notifiedBy;
            activityLog.notes = req.body.notes;
            activityLog.notifiedTo = req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.sendToEstimator = req.body.sendToEstimator;
            activityLog.followUp.date = req.body.followUp.date;
            activityLog.followUp.time = req.body.followUp.time;
            activityLog.activity = req.body.activityID;
            activityLog.documents = req.body.documents;
            activityLog.statusName = statusName;
            return activityLog.save().then();
        })
        .then(newLog => {
            Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
                if (req.body.waitingOnActionFromStoreLog) {
                    let nextLog = null;

                    ActivityLog.find({"project": req.body.projectID})
                        .populate({path: 'activity', model: 'activity'})
                        .exec()
                        .then(logs => {
                            logs.forEach(activityLog => {
                                if (!['other','waitingOnActionFromStore','changeOfLaborPOOrPay'].indexOf(activityLog.activity.code) >= 0
                                    && activityLog.activityDate <= req.body.waitingOnActionFromStore.activityDate) {

                                    if (!nextLog || activityLog.activityDate > nextLog.activityDate) {
                                        nextLog = activityLog;
                                    }
                                }
                            });

                            let log = {
                                activityLog: newLog,
                                project: updatedProject
                            };

                            res.json({
                                followUpDate: req.body.followUp.date,
                                followUpTime: req.body.followUp.time,
                                status: nextLog ? nextLog.status : null,
                                activity: activityDoc,
                                log: log
                            })
                        });
                } else {
                    let log = {
                        activityLog: newLog,
                        project: updatedProject
                    };

                    res.json({
                        followUpDate: req.body.followUp.date,
                        followUpTime: req.body.followUp.time,
                        activity: activityDoc,
                        log: log
                    })

                }


            });
        });
};

ActivityLogController.prototype.logInstallMaterialsReceivedActivity = (req, res) => {

    let updatedProject = null;
    let activityDoc = null;
    let status = null;

    console.log('install materials received activity log body', req.body);

    Activity.findById(req.body.activityID)
        .populate('status')
        .populate('nextStatus')
        .exec()
        .then(activity => {
            status = activity.status;
            activityDoc = activity;

            return Project.findByIdAndUpdate(req.body.projectID,
                {$set:  {'details.status': activity.status,
                    'details.followUpDate': req.body.followUp.date,
                    'details.followUpTime': req.body.followUp.time
                }, new: true})
                .populate({
                    path: "details.primaryStatus",
                    model: "status"
                })
                .exec();

        })
        .then(project => {
            updatedProject = project;

            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            const activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.notifiedBy = req.body.notifiedBy;
            activityLog.notes = req.body.notes;
            activityLog.notifiedTo = req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.followUp.date = req.body.followUp.date;
            activityLog.followUp.time = req.body.followUp.time;
            activityLog.activity = req.body.activityID;
            activityLog.documents = req.body.documents;
            activityLog.statusName = statusName;
            return activityLog.save().then();
        })
        .then(newLog => {
            Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
                ActivityLog.find({"project": req.body.projectID})
                    .populate({path: 'activity', model: 'activity'})
                    .exec()
                    .then(logs => {
                        logs.forEach(activityLog => {
                            if (activityLog._id.toString() !== newLog._id.toString()
                                && newActivity.replacesActivities.indexOf(activityLog.activity._id.toString()) >= 0) {

                                activityLog.followUp.date = null;
                                activityLog.followUp.time = null;
                                activityLog.save();
                            }
                        });

                        let log = {
                            activityLog: newLog,
                            project: updatedProject
                        };

                        res.json({
                            followUpDate: req.body.followUp.date,
                            followUpTime: req.body.followUp.time,
                            status: status,
                            activity: activityDoc,
                            log: log
                        })
                    });
            });
        });
};


ActivityLogController.prototype.logReassignEstimatorActivity = (req, res) => {

    let updatedProject = null;
    let activityDoc = null;
    let status = null;
    let tentativeStartDate = req.body.tentativeStartDate ? new Date(req.body.tentativeStartDate) : null;
    let tentativeStartTimeFrom = req.body.tentativeStartTimeWindow.from ? new Date(req.body.tentativeStartTimeWindow.from) : null;
    let tentativeStartTimeTo = req.body.tentativeStartTimeWindow.to ? new Date(req.body.tentativeStartTimeWindow.to) : null;

    console.log('reassign estimator activity log body', req.body);

    Activity.findById(req.body.activityID)
        .populate('status')
        .populate('nextStatus')
        .exec()
        .then(activity => {
            activityDoc = activity;
            status = activityDoc.status;

            return Project.findById(req.body.projectID)
                .exec();
            })
        .then(project => {
            updatedProject = project;
            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            const activityLog = new ActivityLog();

            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.notifiedBy = req.body.notifiedBy;
            activityLog.notes = req.body.notes;
            activityLog.notifiedTo = req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.personnelID = req.body.personnelID;
            activityLog.personnelOverride = req.body.personnelOverride;
            activityLog.personnelOverrideReason = req.body.personnelOverrideReason;        
            activityLog.followUp.date = req.body.followUp.date;
            activityLog.followUp.time = req.body.followUp.time;
            activityLog.activity = req.body.activityID;
            activityLog.documents = req.body.documents;
            activityLog.statusName = statusName;

            if (tentativeStartDate) {
                activityLog.tentativeStartDate = tentativeStartDate;
                activityLog.tentativeStartTimeWindow.from = tentativeStartTimeFrom;
                activityLog.tentativeStartTimeWindow.to = tentativeStartTimeTo;
                activityLog.tentativeAppointmentDurationHours = req.body.tentativeAppointmentDurationHours;
                activityLog.tentativeAppointmentDurationMinutes = req.body.tentativeAppointmentDurationMinutes;
            }

            return activityLog.save().then();
        })
        .then(newLog => {
            Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
                ActivityLog.find({"project": req.body.projectID})
                    .populate({path: 'activity', model: 'activity'})
                    .exec()
                    .then(logs => {
                        logs.forEach(activityLog => {
                            if (activityLog._id.toString() !== newLog._id.toString()
                                && newActivity.replacesActivities.indexOf(activityLog.activity._id.toString()) >= 0) {

                                activityLog.followUp.date = null;
                                activityLog.followUp.time = null;
                                activityLog.save();
                            }
                        });

                        let log = {
                            activityLog: newLog,
                            project: updatedProject
                        };

                        res.json({
                            followUpDate: req.body.followUp.date,
                            followUpTime: req.body.followUp.time,
                            activity: activityDoc,
                            log: log
                        })
                    });
            });


        });
};

// Activity.findById(newLog.activity.toString())
//     .exec()
//     .then(newActivity => {
//
//
//
//         const log = {
//             activityLog: newLog,
//             project: updatedProject
//         };
//
//         res.json({
//             followUpDate: req.body.followUp.date,
//             followUpTime: req.body.followUp.time,
//             activity: activityDoc,
//             log: log
//         })
//     });

ActivityLogController.prototype.logRefigureCheckInForReviewActivity = (req, res) => {

    let updatedProject = null;
    let status = null;

    Activity.findById(req.body.activityID)
        .populate('status')
        .populate('nextStatus')
        .exec()
        .then(activity => {
            status = activity.status;
            return Project.findByIdAndUpdate(req.body.projectID,
                {$set:  {
                    'details.status': activity.status,
                    'priorityEstimate': req.body.priorityEstimate,
                    'details.primaryStatus': req.body.primaryStatus
                }, new: true})
                .populate({
                    path: "details.primaryStatus",
                    model: "status"
                })
                .exec()
        })
        .then(project => {
            updatedProject = project;
            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            let activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.notifiedBy = req.body.notifiedBy;
            activityLog.notes = req.body.notes;
            activityLog.notifiedTo= req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.followUp.date = req.body.followUp.date;
            activityLog.numberOfRefigures = req.body.numberOfRefigures;
            activityLog.activity = req.body.activityID;
            activityLog.documents = req.body.documents;
            activityLog.priorityEstimate = req.body.priorityEstimate;
            activityLog.statusName = statusName;
            return activityLog.save()
        })
        .then(newLog => {
            Activity.findById(newLog.activity.toString())
                .exec()
                .then(newActivity => {
                    ActivityLog.find({"project": req.body.projectID})
                        .populate({path: 'activity', model: 'activity'})
                        .exec()
                        .then(logs => {
                            logs.forEach(activityLog => {
                                if (activityLog._id.toString() !== newLog._id.toString()
                                    && newActivity.replacesActivities.indexOf(activityLog.activity._id.toString()) >= 0) {

                                    activityLog.followUp.date = null;
                                    activityLog.followUp.time = null;
                                    activityLog.save();
                                }
                            });

                            let log = {
                                activityLog: newLog,
                                project: updatedProject
                            };

                            res.json({
                                followUpDate: req.body.followUp.date,
                                status: status,
                                priorityEstimate: req.body.priorityEstimate,
                                log: log
                            })
                        });
            });
    });

};

ActivityLogController.prototype.logRefigureRequestedActivity = (req, res) => {

    let updatedProject = null;
    let status = null;
    let activityDoc = null;


    console.log('refigure requested activity log body', req.body);

    Activity.findById(req.body.activityID)
        .populate('status')
        .populate('nextStatus')
        .exec()
        .then(activity => {
            status = activity.status;
            activityDoc = activity;
            return Project.findByIdAndUpdate(req.body.projectID,
                {$set: {
                    'details.status': activity.status,
                    'details.primaryStatus': activity.status,
                    'details.lastPrimaryStatus' : req.body.lastPrimaryStatus,
                    'details.lastStatus' : req.body.lastStatus,
                    'details.followUpDate': req.body.followUp.date,
                    'details.followUpTime': req.body.followUp.time
                }, new: true})
                .exec();
        })
        .then(project => {
            updatedProject = project;
            updatedProject.details.primaryStatus = activityDoc.status;
            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            let activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.quoteNumber = req.body.quoteNumber;
            activityLog.quoteName = req.body.quoteName;
            activityLog.notifiedBy = req.body.notifiedBy;
            activityLog.notes = req.body.notes;
            activityLog.notifiedTo = req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.sendToEstimator = req.body.sendToEstimator;
            activityLog.followUp.date = req.body.followUp.date;
            activityLog.followUp.time = req.body.followUp.time;
            activityLog.activity = req.body.activityID;
            activityLog.documents = req.body.documents;
            activityLog.statusName = statusName;
            return activityLog.save().then();

        })
        .then(newLog => {
            Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
                let log = {
                    activityLog: newLog,
                    project: updatedProject
                };
                res.json({
                    followUpDate: req.body.followUp.date,
                    followUpTime: req.body.followUp.time,
                    status: status,
                    lastStatus: req.body.lastStatus,
                    activity: activityDoc,
                    log: log

                })
            });
        });
};

ActivityLogController.prototype.logRemeasureRequestedActivity = (req, res) => {

    let updatedProject = null;
    let status = null;
    let nextStatus = null;
    let activityDoc = null;

    let undefinedWindow = {
        from: undefined,
        to: undefined
    }

    console.log('remeasure requested activity log body', req.body);

    Activity.findById(req.body.activityID)
        .populate('status')
        .populate('nextStatus')
        .exec()
        .then(activity => {
            status = activity.status;
            nextStatus = activity.nextStatus
            activityDoc = activity;
            return Project.findByIdAndUpdate(req.body.projectID,
                {
                    $set: {
                        'details.status': activity.nextStatus,
                        'details.primaryStatus': activity.status,
                        'details.lastStatus' : req.body.lastStatus,
                        'details.followUpDate': req.body.followUp.date,
                        'details.followUpTime': req.body.followUp.time,
                        'details.startDate': undefined,
                        'details.startTimeWindow': undefinedWindow,
                        'details.tentativeStartDate': undefined,
                        'details.tentativeStartTimeWindow': undefinedWindow,
                       }, new: true
                })
                .exec();
        })
        .then(project => {
            updatedProject = project;
            updatedProject.details.primaryStatus = activityDoc.status;
            updatedProject.details.tentativeStartDate = undefined;
            updatedProject.details.tentativeStartTimeWindow = undefinedWindow;
            updatedProject.details.startDate = undefined;
            updatedProject.details.startTimeWindow = undefinedWindow;
            let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
            let activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.body.projectID;
            activityLog.user = req.body.userID;
            activityLog.quoteNumber = req.body.quoteNumber;
            activityLog.quoteName = req.body.quoteName;
            activityLog.notifiedBy = req.body.notifiedBy;
            activityLog.notes = req.body.notes;
            activityLog.notifiedTo = req.body.notifiedTo;
            activityLog.notifiedToNotes = req.body.notifiedToNotes;
            activityLog.sendToEstimator = req.body.sendToEstimator;
            activityLog.followUp.date = req.body.followUp.date;
            activityLog.followUp.time = req.body.followUp.time;
            activityLog.activity = req.body.activityID;
            activityLog.documents = req.body.documents;
            activityLog.statusName = statusName;
            return activityLog.save().then();

        })
        .then(newLog => {
            Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
                let log = {
                    activityLog: newLog,
                    project: updatedProject
                };
                res.json({
                    followUpDate: req.body.followUp.date,
                    followUpTime: req.body.followUp.time,
                    status: nextStatus,
                    lastStatus: req.body.lastStatus,
                    primaryStatus: status,
                    activity: activityDoc,
                    log: log

                })
            });
        });
};


ActivityLogController.prototype.logWaitingOnActionFromStoreActivity = (req, res) => {

        let updatedProject = null;
        let status = null;
        let activityDoc = null;

        console.log('waiting on action from store activity log body', req.body);

        Activity.findById(req.body.activityID)
            .populate('status')
            .populate('nextStatus')
            .exec()
            .then(activity => {
                status = activity.status;
                activityDoc = activity;
                return Project.findByIdAndUpdate(req.body.projectID,
                    {
                        $set: {
                            'details.status': activity.status,
                            'details.followUpDate': req.body.followUp.date,
                            'details.followUpTime': req.body.followUp.time
                        }, new: true
                    })
                    .exec();
            })
            .then(project => {
                updatedProject = project;
                updatedProject.details.primaryStatus = undefined;
                let statusName = req.body.primaryStatusName ? (req.body.primaryStatusName + ': ' + status.name) : status.name;
                let activityLog = new ActivityLog();
                activityLog.activityDate = new Date();
                activityLog.project = req.body.projectID;
                activityLog.user = req.body.userID;
                activityLog.quoteNumber = req.body.quoteNumber;
                activityLog.quoteName = req.body.quoteName;
                activityLog.notifiedBy = req.body.notifiedBy;
                activityLog.notes = req.body.notes;
                activityLog.notifiedTo = req.body.notifiedTo;
                activityLog.notifiedToNotes = req.body.notifiedToNotes;
                activityLog.sendToEstimator = req.body.sendToEstimator;
                activityLog.followUp.date = req.body.followUp.date;
                activityLog.followUp.time = req.body.followUp.time;
                activityLog.activity = req.body.activityID;
                activityLog.documents = req.body.documents;
                activityLog.statusName = statusName;
                return activityLog.save().then();

            })
            .then(newLog => {
                Activity.findById(newLog.activity.toString()).exec().then(newActivity => {
                    let log = {
                        activityLog: newLog,
                        project: updatedProject
                    };
                    res.json({
                        followUpDate: req.body.followUp.date,
                        followUpTime: req.body.followUp.time,
                        status: status,
                        activity: activityDoc,
                        log: log

                    })
                });
            });
    };


ActivityLogController.prototype.updateChangeOfLaborPOOrPayActivityLog = (req, res) => {

    let updatedActivityLog = {};

    ActivityLog.findByIdAndUpdate(req.params.changeOfLaborPOOrPayActivityLogId, req.body, {new: true})
        .populate({
            path: 'activity',
            model: 'activity',
            populate: {path: 'status', model: 'status'}
        })
        .exec()
        .then(activity => {
            updatedActivityLog = activity;

            const log = {
                activityLog: updatedActivityLog,
            };

            res.json({
                followUpDate: req.body.followUp.date,
                status: updatedActivityLog.activity.status,
                log: log
            })
        })
};


ActivityLogController.prototype.updateCheckInForReviewActivityLog = function(req, res) {

    let updatedProject = null;
    let status = null;

    Activity.findById(req.body.activityID)
        .populate('status')
        .populate('nextStatus')
        .exec()
        .then(activity => {
            status = activity.status;
            return Project.findById(req.body.projectID)
                .exec();
        })
        .then(project => {

            updatedProject = project;
            return ActivityLog.findByIdAndUpdate(
                req.params.checkInForReviewActivityLogId,
                req.body)
                .exec()

        }).then(newLog => {
        Activity.findById(newLog.activity.toString()).exec().then(newActivity => {

            let log = {
                activityLog: newLog,
                project: updatedProject
            };

            res.json({
                followUpDate: req.body.followUp.date,
                status: status,
                log: log
            })

        });
    });

};


ActivityLogController.prototype.updateScheduleActivityLog = function(req, res) {

    console.log("scheduled log req.body", req.body);

    let updatedProject = null;
    let status = null;

    Activity.findById(req.body.activityID)
        .populate('status')
        .populate('nextStatus')
        .exec()
        .then(activity => {
            status = activity.status;
            return Project.findByIdAndUpdate(req.body.projectID,
                {$set:  {'details.followUpDate': req.body.followUp.date,
                    'details.startDate': req.body.startDate,
                    'details.startTimeWindow': req.body.startTimeWindow
                }, new: true})
                .exec();
        })
        .then(project => {

            updatedProject = project;
            return ActivityLog.findByIdAndUpdate(
                req.params.scheduleActivityLogId,
                req.body)
                .exec()

        }).then(newLog => {

            let log = {
                activityLog: newLog,
                project: updatedProject
            };

            res.json({
                followUpDate: req.body.followUp.date,
                status: status,
                log: log
            })
    });

};


ActivityLogController.prototype.updateGenericActivityLog = function(req, res){

    let updatedActivityLog = {};
    ActivityLog.findByIdAndUpdate(req.params.genericActivityLogId, req.body, {new: true})
        .populate({
            path: 'activity',
            model: 'activity',
            populate: {path: 'status', model: 'status'}
        })
        .exec()
        .then(activity => {
            updatedActivityLog = activity;

            console.log("updated status", activity);

            return Project.findById(req.body.projectID).exec();
        })
        .then(project => {

            let log = {
                activityLog: updatedActivityLog,
                project: project
            };

            res.json({
                followUpDate: req.body.followUp.date,
                status: updatedActivityLog.activity.status,
                log: log
            })

        })

};

ActivityLogController.prototype.updateAttemptToSellActivityLog = function(req, res){

    console.log("attempt to sell body", req.body);

    let updatedActivityLog = {};
    ActivityLog.findByIdAndUpdate(req.params.logId, req.body, {new: true})
        .populate({
            path: 'activity',
            model: 'activity',
            populate: {path: 'status', model: 'status'}
        })
        .exec()
        .then(activity => {
            updatedActivityLog = activity;

            console.log("updated status", activity);

            return Project.findByIdAndUpdate(req.body.projectID,
                {$set:  {'details.followUpDate': req.body.followUp.date,
                    'details.status': activity.status,
                    'details.lastPrimaryStatus' : activity.status,
                    'details.lastStatus' : req.body.lastStatus,
                    'details.primaryStatus': null}, new: true})
                .exec();
        })
        .then(project => {

            let log = {
                activityLog: updatedActivityLog,
                project: project
            };

            res.json({
                followUpDate: req.body.followUp.date,
                status: updatedActivityLog.activity.status,
                log: log
            })

        })

};

ActivityLogController.prototype.updateEstimateCreateActivityLog = function(req, res){

    let updatedActivityLog = {};
    ActivityLog.findByIdAndUpdate(req.params.estimateCreatedActivityLogId, req.body, {new: true})
        .populate({
            path: 'activity',
            model: 'activity',
            populate: {path: 'status', model: 'status'}
        })
        .exec()
        .then(activity => {
            updatedActivityLog = activity;

            let log = {
                activityLog: updatedActivityLog,
            };

            res.json({
                followUpDate: req.body.followUp.date,
                status: updatedActivityLog.activity.status,
                log: log
            })
        })

};

ActivityLogController.prototype.updateInstallCreateActivityLog = function(req, res){

    let updatedActivityLog = {};
    ActivityLog.findByIdAndUpdate(req.params.estimateCreatedActivityLogId, req.body, {new: true})
        .populate({
            path: 'activity',
            model: 'activity',
            populate: {path: 'status', model: 'status'}
        })
        .exec()
        .then(activity => {
            updatedActivityLog = activity;

            let log = {
                activityLog: updatedActivityLog,
            };

            res.json({
                followUpDate: req.body.followUp.date,
                status: updatedActivityLog.activity.status,
                log: log
            })
        })

};


ActivityLogController.prototype.updateOtherActivityLog = (req, res) => {

    let updatedActivityLog = {};

    ActivityLog.findByIdAndUpdate(req.params.otherActivityLogId, req.body, {new: true})
        .populate({
            path: 'activity',
            model: 'activity',
            populate: {path: 'status', model: 'status'}
        })
        .exec()
        .then(activity => {
            updatedActivityLog = activity;

            const log = {
                activityLog: updatedActivityLog,
            };

            res.json({
                followUpDate: req.body.followUp.date,
                status: updatedActivityLog.activity.status,
                log: log
            })
        })
};

ActivityLogController.prototype.updateRefigureRequestedActivityLog = (req, res) => {

    let updatedActivityLog = {};

    ActivityLog.findByIdAndUpdate(req.params.refigureRequestedActivityLogId, req.body, {new: true})
        .populate({
            path: 'activity',
            model: 'activity',
            populate: {path: 'status', model: 'status'}
        })
        .exec()
        .then(activity => {
            updatedActivityLog = activity;

            const log = {
                activityLog: updatedActivityLog,
            };

            res.json({
                followUpDate: req.body.followUp.date,
                status: updatedActivityLog.activity.status,
                log: log
            })
        })
};

ActivityLogController.prototype.updateRemeasureRequestedActivityLog = (req, res) => {

    let updatedActivityLog = {};

    ActivityLog.findByIdAndUpdate(req.params.remeasureRequestedActivityLogId, req.body, {new: true})
        .populate({
            path: 'activity',
            model: 'activity',
            populate: {path: 'status', model: 'status'}
        })
        .exec()
        .then(activity => {
            updatedActivityLog = activity;

            const log = {
                activityLog: updatedActivityLog,
            };

            res.json({
                followUpDate: req.body.followUp.date,
                status: updatedActivityLog.activity.status,
                log: log
            })
        })
};


ActivityLogController.prototype.updateWaitingOnActionFromStoreActivityLog = (req, res) => {

        let updatedActivityLog = {};

        ActivityLog.findByIdAndUpdate(req.params.waitingOnActionFromStoreActivityLogId, req.body, {new: true})
            .populate({
                path: 'activity',
                model: 'activity',
                populate: {path: 'status', model: 'status'}
            })
            .exec()
            .then(activity => {
                updatedActivityLog = activity;

                const log = {
                    activityLog: updatedActivityLog,
                };

                res.json({
                    followUpDate: req.body.followUp.date,
                    status: updatedActivityLog.activity.status,
                    log: log
                })
            })
    };


ActivityLogController.prototype.update = function(req, res){

    ActivityLog.findByIdAndUpdate(req.params.activityLogId, req.body, {new: true},
        function(err, activityLog) {
            if (err) {
                console.log("update error", err)
            }
            else
            {
                res.json(activityLog);
            }
        });

};


ActivityLogController.prototype.getActivityLogById = function(req, res) {

    console.log("byId req.params", req.params);

    SystemPreferences.find({}).exec()
        .then(systemPreferences => {
            preferences = systemPreferences[0];
            return ActivityLog.findById(req.params.activityLogId)
                .populate({path: 'activity', model: 'activity'})
                .populate({path: 'project', model: 'project'})
                .populate({
                    path: 'user',
                    model: 'user',
                    populate: {
                        path: 'userRole',
                        model: 'userRole'
                    }
                })
                .exec()
        })
        .then(log => {

            Activity.find({})
                .exec(function( err, activities) {
                    if (err) {
                        res.json(error)
                    } else {
                        let activityLog = log.toObject();
                        activityLog.activities = activities;
                        activityLog.preferences = preferences;
                        res.json(activityLog);
                    }
                });

        });

};

ActivityLogController.prototype.getActivityLogsByProject = function(req, res, next) {

    ActivityLog.find({"project" : req.params.projectId})
        .populate( {path: 'status', model: 'status'} )
        .populate( {path: 'activity', model: 'activity'} )
        .exec(function (err, logs) {
        if (err) {
            return next(err);
        } else {
            req.activityLogs = Utilities.sortObjectArrayByDate(logs);
            next();
        }
    });

};

ActivityLogController.prototype.createInitialEstimateActivityLog = function(req, res) {

    let initialActivity = {};
    let preferences = {};

    SystemPreferences.find({}).exec()
        .then(systemPreferences => {
            console.log("prefs")
            preferences = systemPreferences[0];
            return Activity.findOne({sequence: 1, projectType: 'Estimate'}).exec();
        })
        .then(activity => {
            noOfDays = preferences[activity.followUpDaysPreferenceProperty];
            initialActivity = activity;
            return Project.findByIdAndUpdate(req.params.projectID,
                {$set:  {'details.status': activity.status,
                    'details.followUpDate': moment(new Date()).add(noOfDays, 'days').toDate()
                }})
                .exec();
        })
        .then(function(project) {
            console.log("act")
            let activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.params.projectID;
            activityLog.user = req.params.userID;
            activityLog.notes = "Estimate Created";
            activityLog.followUp.date = moment(new Date()).add(noOfDays, 'days').toDate();
            activityLog.activity = initialActivity;
            activityLog.save();
            res.json(activityLog)
        });

};

ActivityLogController.prototype.createInitialInstallActivityLog = function(req, res) {

    let initialActivity = {};

    Activity.findOne({sequence: 1, projectType: 'Install'})
        .exec()
        .then(function (activity) {
            initialActivity = activity;
            return Project.findByIdAndUpdate(req.params.projectID,
                {$set:  {'details.status': activity.status,
                    'details.followUpDate': moment(new Date()).add(1, 'days').toDate()
                }})
                .exec();
        })
        .then(function(project) {
            let activityLog = new ActivityLog();
            activityLog.activityDate = new Date();
            activityLog.project = req.params.projectID;
            activityLog.user = req.params.userID;
            activityLog.notes = "Install Created";
            activityLog.followUp.date = moment(new Date()).add(1, 'days').toDate();
            activityLog.activity = initialActivity;
            activityLog.save();
            res.json(activityLog)
        });

};
////////// MY CONTROLLER ////////////
ActivityLogController.prototype.getActivityLogReport = (req, res) => {

    console.log('MONGOOSE REQUEST RECEIVED:', req.body);
    console.log('.');

    ActivityLog.find({
        'activityDate': { $gte: new Date(req.body.beginDate), $lte: new Date(req.body.endDate) }
    })
        .populate({
            path: 'project',
            model: 'project',
            populate: [
                {
                    path: 'details.personnelID',
                    model: 'personnel'
                },
                {
                    path: 'jobID',
                    model: 'job',
                    populate: {
                        path: 'customerID',
                        model: 'customer'
                    }
                }],
        })
        .populate({
            path: 'activity',
            model: 'activity'
        })
        .exec()
        .then(logs => {
            let unsortedProjectLogs = [];

            if (req.body.projectTypes.length === 0) {
                console.log('projectTypes empty, populating...')
                req.body.projectTypes = ['Estimate', 'Install', 'Repair'];
            }

            logs.forEach((log) => {

                //   log has aproject  && the request array for project types contain the same type in the log
                if (log.project && req.body.projectTypes.indexOf(log.project.projectType) >= 0) {

                    if (req.body.activityIds.indexOf(log.activity.id) >= 0) {
                        console.log(' IF Log Found --> IF ID Matched at indexes:', req.body.activityIds.indexOf(log.activity.id));
                        unsortedProjectLogs.push(log);
                    }
                }
                // sort the returned logs...
                unsortedProjectLogs = Utilities.sortObjectArrayByDateDesc(unsortedProjectLogs, 'activityDate');
                // unsortedProjectLogs = Utilities.sortObjectArrayByStringField(unsortedProjectLogs, '')
            }) //logs.forEach

            console.log('Returning Total Activities Found:', unsortedProjectLogs.length);
            res.json(unsortedProjectLogs);

        })
        .catch(error => {
            return next(error);
        })

    // activity: {type: Schema.Types.ObjectId, ref: 'activity', default: null},
}

////////////// MY CONTROLLER //////////////////


ActivityLogController.prototype.getLateArrivalTracking = (req, res) => {

    const reportCriteria = JSON.parse(req.params.reportCriteria);
    console.log(reportCriteria);
    ActivityLog.find({
        "startTimeWindow.lateArrival": true,
        "activityDate": { $gte: new Date(reportCriteria.beginDate), $lte: new Date(reportCriteria.endDate) }
        // NOTE: cannot do these because they need to be populated first, we have no JOINs in mongo
        // "project.projectType": { $in: projectTypes },
        // "project.details.personnelID": { $in: personnelIDs }
    })
        .populate({
            path: "project",
            model: "project",
            populate: [{
                path: "details.personnelID",
                model: 'personnel'
            }]
        })
        .exec(function (err, logs) {
            if (err) {
                return next(err);
            }

            // loop through logs, get Subset of fields to respond
            let tempLogs = [];

            logs.forEach((log) => {

                if (reportCriteria.projectTypes.find(val => val === log.project.projectType)
                    && reportCriteria.personnelIDs.find(val => val === log.project.details.personnelID.id)) {

                    tempLogs.push({
                        activityDate: log.activityDate,
                        projectID: log.project.id,
                        personnelName: log.project.details.personnelID.personnelName,
                        firstName: log.project.details.personnelID.firstName,
                        lastName: log.project.details.personnelID.lastName,
                        startTimeWindow: Utilities.strDateToHhMm(log.startTimeWindow.from) +
                                 ' - ' + Utilities.strDateToHhMm(log.startTimeWindow.to),
                        logTime: Utilities.strDateToHhMm(log.activityDate),
                        minutesLate: Utilities.strDifferenceInMinutes(log.activityDate, new Date(log.startTimeWindow.to))
                    })
                }
            });

            // To get array sorted by projectID then by activityDate descending, need to sort in reverse order,
            // one field at a time.
            // So, first sort by date descending, and then by projectID
            tempLogs = Utilities.sortObjectArrayByDateDesc(tempLogs, 'activityDate');
            tempLogs = Utilities.sortObjectArrayByStringField(tempLogs, 'projectID');

            // For each project, add the most recent record only
            let idToCheck = '';
            let activityLogs = [];

            tempLogs.forEach((log) => {
                // array is sorted by projectID ascending, then by activityDate descending

                if (idToCheck !== log.projectID) {
                    // the first one has the most recent date, we want to keep this one
                    activityLogs.push(log);
                }

                idToCheck = log.projectID;
            });

            // Now sort by personnel last name, then first name
            activityLogs = Utilities.sortObjectArrayByStringField(activityLogs, 'firstName');
            // activityLogs = Utilities.sortObjectArrayByStringField(activityLogs, 'lastName');

            res.json(activityLogs);
        });
};


ActivityLogController.prototype.getEmailPrintEstimateClosing = (req, res) => {

    const reportCriteria = JSON.parse(req.params.reportCriteria);

    // ActivityLog.find({
    //     "startTimeWindow.lateArrival": true,
    //     "activityDate": { $gte: new Date(reportCriteria.beginDate), $lte: new Date(reportCriteria.endDate) }
    //     // NOTE: cannot do these because they need to be populated first, we have no JOINs in mongo
    //     // "project.projectType": { $in: projectTypes },
    //     // "project.details.personnelID": { $in: personnelIDs }
    // })
    //     .populate({
    //         path: "project",
    //         model: "project",
    //         populate: [{
    //             path: "details.personnelID",
    //             model: 'personnel'
    //         }]
    //     })
    //     .exec(function (err, logs) {
    //         if (err) {
    //             return next(err);
    //         }
    //
    //         // loop through logs, get subset of fields to respond
    //         let tempLogs = [];
    //
    //         logs.forEach((log) => {
    //
    //             if (reportCriteria.projectTypes.find(val => val === log.project.projectType)
    //                 && reportCriteria.personnelIDs.find(val => val === log.project.details.personnelID.id)) {
    //
    //                 tempLogs.push({
    //                     activityDate: log.activityDate,
    //                     projectID: log.project.id,
    //                     personnelName: log.project.details.personnelID.personnelName,
    //                     firstName: log.project.details.personnelID.firstName,
    //                     lastName: log.project.details.personnelID.lastName,
    //                     startTimeWindow: Utilities.strDateToHhMm(log.startTimeWindow.from) +
    //                     ' - ' + Utilities.strDateToHhMm(log.startTimeWindow.to),
    //                     logTime: Utilities.strDateToHhMm(log.activityDate),
    //                     minutesLate: Utilities.strDifferenceInMinutes(log.activityDate, new Date(log.startTimeWindow.to))
    //                 })
    //             }
    //         });
    //
    //         // To get array sorted by projectID then by activityDate descending, need to sort in reverse order,
    //         // one field at a time.
    //         // So, first sort by date descending, and then by projectID
    //         tempLogs = Utilities.sortObjectArrayByDateDesc(tempLogs, 'activityDate');
    //         tempLogs = Utilities.sortObjectArrayByStringField(tempLogs, 'projectID');
    //
    //         // For each project, add the most recent record only
    //         let idToCheck = '';
    //         let activityLogs = [];
    //
    //         tempLogs.forEach((log) => {
    //             // array is sorted by projectID ascending, then by activityDate descending
    //
    //             if (idToCheck !== log.projectID) {
    //                 // the first one has the most recent date, we want to keep this one
    //                 activityLogs.push(log);
    //             }
    //
    //             idToCheck = log.projectID;
    //         });
    //
    //         // Now sort by personnel last name, then first name
    //         activityLogs = Utilities.sortObjectArrayByStringField(activityLogs, 'firstName');
    //         // activityLogs = Utilities.sortObjectArrayByStringField(activityLogs, 'lastName');
    //
    //         res.json(activityLogs);
    //     });
    res('TODO: implement getEmailPrintEstimateClosing')
};


ActivityLogController.prototype.storeBase64EstimateRefigurePdf = (req, res) => {

    let { fileName, base64String } = req.body;

    // if no .pdf extension on fileName, add it
    if (fileName.substr(-4) !== '.pdf') {
        fileName = `${fileName}.pdf`;
    }

    // 1. Write a temp file to the disk; will be deleted during 'on end'
    //    fs.writeFile is asynchronous
    fs.writeFile(fileName, base64String, {encoding: 'base64'}, (err) => {
        if (err) {
            console.log("writeFile error", err);
        } else {
            console.log(`success writing file: ${fileName}`);

            const fileID = mongoose.Types.ObjectId();
            const writestream = gfs.createWriteStream({
                _id: fileID,
                filename: fileName,
                mode: 'w',
                content_type: 'application/pdf'
            });

            fs.createReadStream(fileName)
                .on("end", () => {
                    // fs.unlink deletes the temp file off the disk

                    fs.unlink(fileName, (error) => {
                        if (error) {
                            console.log("unlink error", error)
                        }
                        console.log('unlinked');
                        res.send({
                            fileID: fileID,
                            fileName: fileName
                        });
                    });
                })
                .on("err", () => res.send("Error uploading pdf file"))
                .pipe(writestream);
        }
    });

};


module.exports = ActivityLogController;
