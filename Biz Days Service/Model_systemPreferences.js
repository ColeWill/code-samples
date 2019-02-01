var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const daysOfWeekStartsMonday = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const holidays = [
    { holiday: 'christmasEve', monthDay:'12-24'},
    { holiday: 'christmas', monthDay:'12-25'},
    { holiday: 'christmasDayAfter', monthDay:'12-26'},
    { holiday: 'newYearsEve', monthDay:'12-31' },
    { holiday: 'newYearsDay', monthDay:'01-01' },
    { holiday: 'fourthOfJuly', monthDay:'07-04' },
    { holiday: 'veteransDay', monthDay: '11-11' },

];

var SystemPreferencesSchema = mongoose.Schema({
        company: String,
        periodBeginningDate: Date,
        periodEndingDate: Date,
        firstDayOfWeek: { type: String, default: 'Sunday' },
        noOfDaysEstimateIsValidFor: Number,
        maximumDifferenceBetweenLaborAndPOAmounts: {type: Number, default: 0 },
        defaultCustomerType: { type: mongoose.Schema.ObjectId, ref: 'Type', default: null },
        maximumEstimateRefigureOptions: {type: Number, default: 1},
        maximumDaysForEstimateScheduleCycle: {type: Number, default: 1},
        autoAssignEstimator: {type: Boolean, default: false},
        avgEstimateDurationHours: {type: Number, default: 0},
        avgEstimateDurationMinutes: {type: Number, default: 0},
        maximumExtraMilesAllowed: {type: Number, default: null},
        forNewEstimateSetInitialFollowUpToDays: { type: Number, default: 1 },
        forNewEstimateSetInitialFollowUpToHours: { type: Number, default: 0 },
        forNewInstallsSetInitialFollowUpToDays: { type: Number, default: 1 },
        forNewInstallsSetInitialFollowUpToHours: { type: Number, default: 0 },
        forTentativelyScheduledNewEstimateSetInitialFollowUpToDays: { type: Number, default: 1 },
        forTentativelyScheduledNewEstimateSetInitialFollowUpToHours: { type: Number, default: 0 },
        setFollowUpForSchedulingEstimatesToDays: { type: Number, default: 2 },
        setFollowUpForSchedulingEstimatesToHours: { type: Number, default: 0 },
        setFollowUpForEstimatorUploadDueToDays: { type: Number, default: 0 },
        setFollowUpForEstimatorUploadDueToHours: { type: Number, default: 0 },
        requireCustomerNotificationWhenSubmittingEstimate: { type: Boolean, default: false },
        setFollowUpForRefigureRequestsDueToDays: { type: Number, default: 0 },
        setFollowUpForRefigureRequestsDueToHours: { type: Number, default: 0 },
        useEstimateForClosing: {type: Boolean, default: false},
        storeTypes: [
            {type: mongoose.Schema.ObjectId, ref: 'Type'}
        ],
        emailRetailEstimateToCustomer: {type: Boolean, default: false},
        setFollowUpToCloseSalesToDays: { type: Number, default: 0 },
        setFollowUpToCloseSalesToHours: { type: Number, default: 0 },
        whenProductsReceivedSetFollowUpToDays: { type: Number, default: 0 },
        whenProductsReceivedSetFollowUpToHours: { type: Number, default: 0 },
        setFollowUpForSchedulingInstallsToDays: { type: Number, default: 1 },
        setFollowUpForSchedulingInstallsToHours: { type: Number, default: 0 },
        forNewRepairSetInitialFollowUpToDays: { type: Number, default: 0 },
        forNewRepairSetInitialFollowUpToHours: { type: Number, default: 0 },
        setFollowUpForSchedulingRepairsToDays: { type: Number, default: 1 },
        setFollowUpForSchedulingRepairsToHours: { type: Number, default: 0 },
        setFollowUpForProductETAToDays: { type: Number, default: 1 },
        setFollowUpForProductETAToHours: { type: Number, default: 0 },
        floorWizardHost: String,
        floorWizardUser: String,
        floorWizardPassword: String,
        emailURL: String,
        street: String,
        city: String,
        state: String,
        zip: String,
        defaultEstimateArrivalDurationHours: {type: Number, default: 0},
        defaultEstimateArrivalDurationMinutes: {type: Number, default: 0},
        defaultInstallArrivalDurationHours: {type: Number, default: 0},
        defaultInstallArrivalDurationMinutes: {type: Number, default: 0},
        defaultRepairArrivalDurationHours: {type: Number, default: 0},
        defaultRepairArrivalDurationMinutes: {type: Number, default: 0},
        sendCopyOfEmailsTo: {type: String, default: ''},
        estimateImportPreference: {type: String, default: "Lowe's IMS Interface"},
        lastTimeIMSJobsGotten: { type: Date, default: new Date(0) },

        designatedBusinessDays: {
            monday: { type: Boolean, default: true },
            tuesday: { type: Boolean, default: true },
            wednesday: { type: Boolean, default: true },
            thursday: { type: Boolean, default: true },
            friday: { type: Boolean, default: true },
            saturday: { type: Boolean, default: false },
            sunday: { type: Boolean, default: false }
        },
        designatedHoliday: {
            newYearsEve:  { type: Boolean, default: false }, // Dec 31
            newYearsDay: { type: Boolean, default: false }, // jan 1
            fourthOfJuly: { type: Boolean, default: false }, // july 4
            veteransDay:  { type: Boolean, default: false }, // Nov 11
            christmasEve: { type: Boolean, default: false }, // Dec 24
            christmas: {type: Boolean, default: false}, // Dec 25
            christmasDayAfter: { type: Boolean, default: false }, //Dec 26
            // Dynamic Date Holidays
            mlkDay:  { type: Boolean, default: false }, // third monday in jan
            memorialDay: { type: Boolean, default: false }, // last monday in may
            laborDay: { type: Boolean, default: false }, // first monday of sept
            thanksgiving:  { type: Boolean, default: false }, // 4th thurs Nov
        }
    },
    {
        toObject: {virtuals: true},
        toJSON: {virtuals: true}
    });
SystemPreferencesSchema.virtual('holidays').get(function() {
    return holidays;
});
SystemPreferencesSchema.virtual('daysOfWeek').get(function() {
    return daysOfWeek;
});

SystemPreferencesSchema.virtual('daysOfWeekStartsMonday').get(function() {
    return daysOfWeekStartsMonday;
});

var SystemPreferences = mongoose.model('systemPreferences', SystemPreferencesSchema);

module.exports = SystemPreferences;
