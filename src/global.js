'use strict';

function getAllEncountersOfType(params, encounterType, cutoffDate, filterQuery) {
    return params.db.objects('ProgramEncounter')
        .filtered(`voided == false 
                    AND encounterType.name == $0
                    AND voided == false 
                    AND programEnrolment.individual.voided == false 
                    AND programEnrolment.voided == false 
                    AND programEnrolment.programExitDateTime == null
                    AND programEnrolment.enrolmentDateTime > $1
                    AND ${filterQuery}`, encounterType, cutoffDate);
}

function getAllEncountersOfType_DependentOnAnotherEncounterType(params, encounterType1, encounterType2, cutoffDate, filterQuery) {
    return params.db.objects('ProgramEncounter')
        .filtered(`voided == false 
                    AND (encounterType.name == $0 or encounterType.name == $1)
                    AND voided == false 
                    AND programEnrolment.individual.voided == false 
                    AND programEnrolment.voided == false 
                    AND programEnrolment.programExitDateTime == null
                    AND programEnrolment.enrolmentDateTime > $2
                    AND ${filterQuery}`, encounterType1, encounterType2, cutoffDate);
}

function hasIncompleteEncounters(encounters, imports, schedule, enrolmentBaseDateConcept, observation, cutofDays) {
    if (encounters.length >= schedule.length) return false;
    if(observation && observationEligibilityCheck(encounters, observation)) return false;
    const baseDate = getBaseDate(encounters[0].programEnrolment, enrolmentBaseDateConcept);
    const daysBetween = imports.moment(new Date()).diff(imports.moment(baseDate), 'days');
    const day = schedule[encounters.length];
    //return day.min <= daysBetween && day.max > daysBetween
    
    if(daysBetween > cutofDays) {return false;}
    
    const dueSequences = schedule
        .filter(s => s.min <= daysBetween && daysBetween < s.max)
        .map(s => s.sequence);
    
    const completedSequences = encounters
        .map(enc => enc.observations.find(obs => obs.concept.uuid === "5ee51584-6d54-496c-8a5f-bb7958662bb5"))
        .filter(obs => obs !== undefined && obs.valueJSON)
        .map(obs => JSON.parse(obs.valueJSON).answer)
        .filter(answer => answer !== null);
    
    const missingSequences = dueSequences.filter(seq => !completedSequences.includes(seq));

    const overdueSequences = schedule
          .filter(s => missingSequences.includes(s.sequence) && daysBetween > s.max)
          .map(s => s.sequence);
    
    if (overdueSequences.length > 0) { return false; }
    
    return missingSequences.length > 0;
}

function hasIncompleteEncounters_BasedOnAnotherEncounterTypeObs(encounters, imports, schedule, encounterTypeName, dateConceptName, dateEncounterTypeName, observation, cutofDays){
    const dateEncounters = encounters.filter(enc => enc.encounterType.name == dateEncounterTypeName);
    if(dateEncounters.length == 0) return false;
    
    const baseDate = getBaseDate(dateEncounters[0], dateConceptName);
    const daysBetween = imports.moment(new Date()).diff(imports.moment(baseDate), 'days');
    
    if(daysBetween > cutofDays) return false;
    
    const targetEncounters = encounters.filter(enc => enc.encounterType.name == encounterTypeName);
    //if(targetEncounters.length == 0) return schedule[0].min <= daysBetween && schedule[0].max > daysBetween;
    if(observation && observationEligibilityCheck(targetEncounters, observation)) return false;
    if (targetEncounters.length >= schedule.length) return false;
    
    const day = schedule[targetEncounters.length];
    //return day.min <= daysBetween && day.max > daysBetween;

    const dueSequences = schedule
        .filter(s => s.min <= daysBetween && daysBetween < s.max)
        .map(s => s.sequence);
    
    const completedSequences = encounters
        .map(enc => enc.observations.find(obs => obs.concept.uuid === "5ee51584-6d54-496c-8a5f-bb7958662bb5"))
        .filter(obs => obs !== undefined && obs.valueJSON)
        .map(obs => JSON.parse(obs.valueJSON).answer)
        .filter(answer => answer !== null);
    
    const missingSequences = dueSequences.filter(seq => !completedSequences.includes(seq));
    
    return missingSequences.length > 0;
}

function observationEligibilityCheck(encounters, observation){
    return encounters.some((enc) => {
        return enc.observations.some((obs) => {
            const valueJSON = JSON.parse(obs.valueJSON);
                
            if (obs.concept.uuid == observation.uuid){
                if(typeof observation.answer == "string") {
                    return valueJSON.answer == observation.answer;
                }
                else  if (Array.isArray(observation.answer) && Array.isArray(valueJSON.answer)) {
                    return observation.answer.some(ans => valueJSON.answer.includes(ans));
                }
            }

            return false;
        })
    })
}

function enrolmentHasDueEncounter(enrolment, imports, schedule, enrolmentBaseDateConcept, cutofDays) {
  const baseDate = getBaseDate(enrolment, enrolmentBaseDateConcept);
  const daysBetween = imports.moment(new Date()).diff(imports.moment(baseDate), 'days');
  //return schedule[0].min <= daysBetween && schedule[0].max > daysBetween;

  if(daysBetween > cutofDays) return false;

  const completedSequences = enrolment.encounters
      .map(enc => enc.observations.find(obs => obs.concept.uuid === "5ee51584-6d54-496c-8a5f-bb7958662bb5")) 
      .filter(obs => obs !== undefined && obs.valueJSON)
      .map(obs => JSON.parse(obs.valueJSON).answer)
      .filter(answer => answer !== null);

  return schedule.some(s => 
      s.min <= daysBetween && daysBetween < s.max && daysBetween < cutofDays &&
      !completedSequences.includes(s.sequence)
  );
}

function getBaseDate(entity, baseDateConcept) {
    return entity.getObservationValue(baseDateConcept);
}

function getEnrolmentsWithNoEncounterOfType(params, encounterType, programName, filterQuery) {
    return params.db.objects('ProgramEnrolment')
        .filtered(`voided == false 
                    AND program.name == $0 
                    AND individual.voided == false 
                    AND programExitDateTime == null
                    AND subquery(encounters, $encounter, 
                        $encounter.encounterType.name == $1 
                        AND $encounter.voided == false
                    ).@count == 0
                    AND ${filterQuery}`, programName, encounterType);
}

function hasDeliveryEncounter(params, individualUuid) {
    const deliveryEncounters = params.db.objects('ProgramEncounter').filtered(`voided == false AND programEnrolment.individual.uuid == $0         AND encounterType.name == 'Delivery'`, individualUuid);
    return deliveryEncounters.length > 0;
}

() => {
    function getIndividualsNotPerSchedule_BasedOnEnrolmentObs(params, imports, {
        schedule,
        programName,
        encounterType,
        dateConceptName,
        cutoffMonths,
        cutofDays,
        genderValues,
        addressValues,
        observation
    }) {
        const cutoffDate = imports.moment(new Date()).subtract(cutoffMonths, 'months').toDate();

        let encounterFilterQuery = ` voided = false `;
        let enrolmentFilterQuery = ` voided = false `;
        if(genderValues && genderValues.length > 0){
            const output = `{${genderValues.map(item => `'${item}'`).join(', ')}}`;
            encounterFilterQuery = ` programEnrolment.individual.gender.uuid IN ${output} `;
            enrolmentFilterQuery = ` individual.gender.uuid IN ${output} `
        }
        if(addressValues && addressValues.length > 0){
            const output = `{${addressValues.map(item => `'${item}'`).join(', ')}}`;
            encounterFilterQuery += `AND programEnrolment.individual.lowestAddressLevel.uuid IN ${output} `;
            enrolmentFilterQuery += `AND individual.lowestAddressLevel.uuid IN ${output} `
        }

        const encounters = getAllEncountersOfType(params, encounterType, cutoffDate, encounterFilterQuery);
        const enrolmentEncounters = imports.lodash.groupBy(encounters, 'programEnrolment.uuid');
        const individuals = Object.keys(enrolmentEncounters)
            //.filter(enrolmentUuid => hasIncompleteEncounters(enrolmentEncounters[enrolmentUuid], imports, schedule, dateConceptName, observation, cutofDays))
            .filter(enrolmentUuid => {
                const enrolment = enrolmentEncounters[enrolmentUuid][0].programEnrolment;
                if (hasDeliveryEncounter(params, enrolment.individual.uuid)) {
                  return false;
                }
                const hasDue = hasIncompleteEncounters(enrolmentEncounters[enrolmentUuid], imports, schedule, dateConceptName, observation, cutofDays);
                return hasDue;
            })
            .map(enrolmentUuid => enrolmentEncounters[enrolmentUuid][0].programEnrolment.individual);

        const noEncounterEnrolments = getEnrolmentsWithNoEncounterOfType(params, encounterType, programName, enrolmentFilterQuery)
        //.filter((enrolment) => enrolmentHasDueEncounter(enrolment, imports, schedule, dateConceptName, cutofDays));
        noEncounterEnrolments = noEncounterEnrolments.filter((enrolment) => {
            if (hasDeliveryEncounter(params, enrolment.individual.uuid)) {
                return false;
            }
            const hasDue = enrolmentHasDueEncounter(enrolment, imports, schedule, dateConceptName, cutofDays);
            return hasDue;
        });

        return individuals.concat(noEncounterEnrolments.map(enrolment => enrolment.individual));
    }

    function getIndividualsNotPerSchedule_BasedOnAnotherEncounterTypeObs(params, imports,
                                                                         {
                                                                             schedule,
                                                                             encounterTypeName,
                                                                             dateConceptName,
                                                                             dateEncounterTypeName,
                                                                             cutoffMonths,
                                                                             cutofDays,
                                                                             genderValues,
                                                                             addressValues,
                                                                             observation
                                                                         }) {
        const cutoffDate = imports.moment(new Date()).subtract(cutoffMonths, 'months').toDate();

        let filterQuery = ` voided = false `;
        if(genderValues && genderValues.length > 0){
            const output = `{${genderValues.map(item => `'${item}'`).join(', ')}}`;
            filterQuery = ` programEnrolment.individual.gender.uuid IN ${output} `;
        }
        if(addressValues && addressValues.length > 0){
            const output = `{${addressValues.map(item => `'${item}'`).join(', ')}}`;
            filterQuery += `AND programEnrolment.individual.lowestAddressLevel.uuid IN ${output} `;
        }

        const encounters = getAllEncountersOfType_DependentOnAnotherEncounterType(params, encounterTypeName, dateEncounterTypeName, cutoffDate, filterQuery);
        const groupedEncounters = imports.lodash.groupBy(encounters, 'programEnrolment.uuid');
        const individuals = Object.keys(groupedEncounters)
            .filter(enrolmentUuid => hasIncompleteEncounters_BasedOnAnotherEncounterTypeObs(groupedEncounters[enrolmentUuid], imports, schedule, encounterTypeName, dateConceptName, dateEncounterTypeName, observation, cutofDays))
            .map(enrolmentUuid => groupedEncounters[enrolmentUuid][0].programEnrolment.individual);
        return individuals;
    }

    return {
        getIndividualsNotPerSchedule_BasedOnEnrolmentObs: getIndividualsNotPerSchedule_BasedOnEnrolmentObs,
        getIndividualsNotPerSchedule_BasedOnAnotherEncounterTypeObs: getIndividualsNotPerSchedule_BasedOnAnotherEncounterTypeObs
    }
};
