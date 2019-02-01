var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

let Status = require('./status')

var ActivityLogSchema = new Schema({
    activityDate: Date,
    project: {type: Schema.Types.ObjectId, ref: 'project', default: null},
    user: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        required: true
    },
    statusDate: Date,
    statusName: { type: String, default: '' },
    activity: {type: Schema.Types.ObjectId, ref: 'activity', default: null},
    tentativeStartDate: Date,
    startDate: Date,
    endDate: Date,
    perCustomer: Boolean,
    soonerIfPossible: Boolean,
    tentativeStartTimeWindow: {
        from: Date,
        to: Date,
        lateArrival: Boolean
    },
    startTimeWindow: {
        from: Date,
        to: Date,
        lateArrival: Boolean
    },
    tentativeAppointmentDurationHours: {type: Number, default: 0},
    tentativeAppointmentDurationMinutes: {type: Number, default: 0},
    appointmentDurationHours: {type: Number, default: 0},
    appointmentDurationMinutes: {type: Number, default: 0},
    numberOfRefigures: {type: Number, default: null},
    notifiedBy: String,
    siteRevisit: {
        visit: Boolean,
        approved: Boolean
    },
    productsLeftOnSite: Boolean,
    notes: String,
    personnelID: { type: Schema.Types.ObjectId, ref: 'personnel', default: null },
    personnelOverride: Boolean,
    personnelOverrideReason: String,
    emailConfirmationSent: Boolean,
    notifiedTo: String,
    notifiedToNotes: String,
    priorityEstimate: {
      type: Boolean,
      default: false
    },
    priorityInstall: {
      type: Boolean,
      default: false
    },
    emailStorePriorityNotification: {
            type: Boolean,
            default: false
    },
    followUp: {
        date: Date,
        time: Date
    },
    quoteNumber: {type: String, default: ''},
    quoteName: {type: String, default: ''},
    lateArrival: {type: Boolean, default: false},
    sendToEstimator: {type: Boolean, default: false},
    documents: [
        {
            type: {type: String, default: ''},
            fileID: String,
            fileName: String
        }
    ]
},
    {
        toObject: { virtuals: true },
        toJSON: { virtuals: true }
});


ActivityLogSchema.virtual('statuses').get(function(){
    return Status;
});


var ActivityLog = mongoose.model('activityLog', ActivityLogSchema);

module.exports = ActivityLog;
