var expect = require('chai').expect;
var StubLoader = require('./stub-loader');
var EditorPresenter = require('./../lib/presentation/editor-presenter');
var Specification = require('./../lib/model/specification');
var ObjectMother = require('./object-mother');
var changes = require('./../lib/model/change-commands');
var Postal = require('postal');
var _ = require('lodash');
var Hierarchy = require('./../lib/stores/hierarchy');
var uuid = require('node-uuid');

var listener = {
  events: [],

  clear: function(){
    this.events = [];
  },

  append: function(data){
    this.events.push(data);
  }
};



function findPublishedMessage(topic){
  return _.find(listener.events, function(x){
    return x.topic == topic;
  });
}


function FakeView(){
  this.state = {};

  this.setState = function(o){
    _.assign(this.state, o);
  }
}

var loader = new StubLoader();

describe('EditorPresenter', function(){
  var view, presenter;

  beforeEach(function(){
    Postal.reset();
    Hierarchy.reset();
    Hierarchy.setLibrary(ObjectMother.library());

    Postal.subscribe({
        channel  : "editor",
        topic    : "*",
        callback : function(data, envelope) {
          data.topic = envelope.topic;
          data.channel = 'editor';
            listener.append(data);
        }
    });

    Postal.subscribe({
        channel  : "engine-request",
        topic    : "*",
        callback : function(data, envelope) {
          data.topic = envelope.topic;
          data.channel = 'engine-request';
            listener.append(data);
        }
    });


    Hierarchy.storeData('spec1', ObjectMother.specData());
    view = new FakeView();
    presenter = new EditorPresenter('spec1');
  });

  describe('when refreshing the editor with data', () => {
    beforeEach(function(){
      var specData = ObjectMother.specification();
      specData['max-retries'] = 3;

      presenter = new EditorPresenter(specData);
      view = new FakeView();
      presenter.activate(loader, view);
    });

    afterEach(() => {
      presenter.deactivate();
    });

    it('should write the retryCount to the view', () => {
      expect(view.state.retryCount).to.equal(3);
    });
  });

  describe('when activating a new editor that has only header information', function(){
    beforeEach(function(){
      var spec = ObjectMother.specData();
      spec.mode = 'header';
      Hierarchy.storeData('spec1', spec);
      view = new FakeView();
      presenter.activate(loader, view);
      presenter.deactivate();
    });

    it('should tell the view that it is loading', function(){
      expect(view.state.loading).to.be.true;
    });

    it('should broadcast a message for the data request', function(){
      var message = findPublishedMessage('spec-data-requested');
      expect(message.id).to.equal('spec1');
      expect(message.channel).to.equal('engine-request');
    });
  });

  describe('when activating a new editor and the data is known', function(){
    var wasRefreshed = false;
    var ownedSpec = null;
    var buttonsEnabled = false;


    beforeEach(function(){
      Hierarchy.storeData('spec1', ObjectMother.specData());
      view = new FakeView();
      presenter = new EditorPresenter('spec1');

      presenter.refreshEditor = function(){
        wasRefreshed = true;
        ownedSpec = this.spec;
        buttonsEnabled = true;
      }
      presenter.activate(loader, view);
      presenter.deactivate();
    });

    it('should get the spec into itself', function(){
      expect(presenter.spec).to.equal(Hierarchy.findSpec('spec1'));
    });

    it('should refresh the editor immediately', function(){
      expect(ownedSpec).to.equal(presenter.spec);
      expect(wasRefreshed).to.be.true;
    });

  });

  describe('when data becomes available for the first time', function(){
    var wasRefreshed = false;
    var ownedSpec = null;
    var buttonsEnabled = false;


    beforeEach(function(){
      Hierarchy.storeData('spec1', ObjectMother.specData());


      presenter = new EditorPresenter('spec1');
      presenter.refreshEditor = function(){
        wasRefreshed = true;
        ownedSpec = this.spec;
        buttonsEnabled = true;
      }
      view = new FakeView();
      presenter.activate(loader, view);

      Postal.publish({
        channel: 'editor', 
        topic: 'spec-changed', 
        data: {id: 'spec1'}
      });
    });

    it('should get the spec into itself', function(){
      expect(presenter.spec).to.equal(Hierarchy.findSpec('spec1'));
    });

    it('should refresh the editor immediately', function(){
      expect(ownedSpec).to.equal(presenter.spec);
      expect(wasRefreshed).to.be.true;
    });

  });

  describe('when data comes available, but does not match the spec', function(){
    var wasRefreshed = false;
    var buttonsEnabled = false;

    beforeEach(function(){
      Hierarchy.storeData('spec1', ObjectMother.specData());
      Hierarchy.storeData('spec2', ObjectMother.specData());


      view = new FakeView();

      presenter = new EditorPresenter('spec1');
      presenter.refreshEditor = function(){
        wasRefreshed = true;
      }

      presenter.enableUndoButtons = function(){
        buttonsEnabled = true;
      }
      presenter.activate(loader, view);

      wasRefreshed = false;

      Postal.publish({
        channel: 'editor', 
        topic: 'spec-data-available', 
        data: {id: 'spec2'}
      });
    });

    it('should not have updated the view', function(){
      expect(wasRefreshed).to.be.false;
      expect(buttonsEnabled).to.be.false;
    });
  });

  describe('when responding to spec-changed that matches', function(){
    var wasRefreshed = false;

    beforeEach(function(){
      Hierarchy.storeData('spec1', ObjectMother.specData());

      view = new FakeView();
      presenter = new EditorPresenter('spec1');
      presenter.activate(loader, view);

      presenter.refreshEditor = function(){
        wasRefreshed = true;
      }

      Postal.publish({
        channel: 'editor', 
        topic: 'spec-changed',
        data: {id: 'spec1'}
      });
    });

    it('should refresh the screen', function(){
      expect(wasRefreshed).to.be.true;
    });


  });

  describe('when responding to spec-changed that does not match', function(){
    var wasRefreshed = false;

    beforeEach(function(){
      Hierarchy.storeData('spec1', ObjectMother.specData());
      
      view = new FakeView();
      presenter = new EditorPresenter('spec1');
      presenter.activate(loader, view);

      

      presenter.refreshEditor = function(){
        wasRefreshed = true;
      }

      Postal.publish({
        channel: 'editor', 
        topic: 'spec-changed',
        data: {id: 'different'}
      });
    });

    it('should NOT intitialize data all over again', function(){
      expect(wasRefreshed).to.be.false;
    });


  });


  describe('when responding to a cell selected from the initial state', function(){
    // var identifier = {step: this.props.id, cell: this.props.cell.key};
    var spec = null;

    beforeEach(function(){
      spec = ObjectMother.specification();
      spec.mode = 'full';
      spec.id = 'foo';

      presenter = new EditorPresenter(spec);
      view = new FakeView();
      presenter.activate(loader, view);

      var stepId = spec.steps[0].steps[1].id;

      presenter.selectCell({step: stepId, cell: 'x'});
    });

    afterEach(function () {
      presenter.deactivate();
    });

    it('should make the right cell active', function(){
      expect(spec.steps[0].steps[1].args.find('x').active).to.be.true;
    });

    it('should make the section holding that cell active', function(){
      expect(spec.steps[0].active).to.equal(true);
    });

    it('should make the specfication itself not active', function(){
      expect(spec.active).to.be.false;
    });

    it('should update the editor state', function(){
      expect(view.state.activeContainer).to.equal(spec.steps[0]);
    });
  });

  describe('when responding to a cell selected from the initial state via Postal', function(){
    // var identifier = {step: this.props.id, cell: this.props.cell.key};

    var spec = null;
    var view = null;

    beforeEach(function(){
      spec = ObjectMother.specification();
      spec.path = 'foo/bar';
      spec.mode = 'full';

      view = new FakeView();
      presenter = new EditorPresenter(spec);
      presenter.activate(loader, view);

      var stepId = spec.steps[0].steps[1].id;

      Postal.publish({
        channel: 'editor',
        topic: 'select-cell',
        data: {step: stepId, cell: 'x'}
      })
    });

    it('should make the right cell active', function(){
      expect(spec.steps[0].steps[1].args.find('x').active).to.be.true;
    });

    it('should make the section holding that cell active', function(){
      expect(spec.steps[0].active).to.equal(true);
    });

    it('should make the specfication itself not active', function(){
      expect(spec.active).to.be.false;
    });

    it('should update the editor state', function(){
      expect(view.state.activeContainer).to.equal(spec.steps[0]);
    });
  });

  describe('when responding to a cell selected that is different', function(){
    // var identifier = {step: this.props.id, cell: this.props.cell.key};

    var spec = null;
    var view = null;

    beforeEach(function(){
      spec = ObjectMother.specification();
      spec.path = 'foo/bar';
      spec.mode = 'full';

      view = new FakeView();
      presenter = new EditorPresenter(spec);
      presenter.activate(loader, view);

      var stepId = spec.steps[0].steps[1].id;

      presenter.selectCell({step: spec.steps[0].steps[1].id, cell: 'x'});
      presenter.selectCell({step: spec.steps[0].steps[4].id, cell: 'result'});
    });

    it('should make the right cell active', function(){
      expect(spec.steps[0].steps[4].args.find('result').active).to.be.true;
    });

    it('should make the previously selected cell be inactive', function(){
      expect(spec.steps[0].steps[1].args.find('x').editing).to.be.false;
    });

    it('should make the section holding that cell active', function(){
      expect(spec.steps[0].active).to.equal(true);
    });

    it('should update the editor state', function(){
      expect(view.state.activeContainer).to.equal(spec.steps[0]);
    });
  });

  describe('when handling a spec change directly', function(){
    var spec = null;
    var view = null;

    beforeEach(function(){
      spec = ObjectMother.specification();
      spec.path = 'foo/bar';

      view = new FakeView();
      presenter = new EditorPresenter(spec);
      presenter.activate(loader, view);

      var stepId = spec.steps[0].steps[1].id;

      presenter.applyChange(changes.cellValue(stepId, 'x', 11));

      presenter.deactivate();
    });

    it('should publish a spec-edited message', () => {
      var message = findPublishedMessage('spec-edited');
      expect(message).to.not.be.null;
    });


    it('should apply the change to the spec itself', function(){
      expect(spec.steps[0].steps[1].findValue('x')).to.equal(11);
    });
  });

  describe('when handling multiple spec changes', function(){
    var spec = null;
    var view = null;
    var step = null;

    beforeEach(function(){
      spec = ObjectMother.specification();
      spec.path = 'foo/bar';

      view = new FakeView();
      presenter = new EditorPresenter(spec);
      presenter.activate(loader, view);

      step = spec.steps[0].steps[1];


      var showQueue = function(){
        for (var i = 0; i < spec.undoList.length; i++){
          console.log((i + 1).toString() + ": " + JSON.stringify(spec.undoList[i]));
        }

        console.log('');
        console.log('');
      }

      var CellChange = require('./../lib/model/cell-change');

      presenter.applyChange(new CellChange(step.id, 'x', 11));
      presenter.applyChange(new CellChange(step.id, 'x', 12));  
      presenter.applyChange(new CellChange(step.id, 'x', 13));
      expect(presenter.spec.changeStatus()).to.deep.equal({applied: 3, unapplied: 0});
    });

    afterEach(function(){
      presenter.deactivate();
    });

    it('can apply an undo', function(){
      presenter.undo();

      expect(presenter.spec.isDirty()).to.be.true;
      expect(presenter.spec.canRedo()).to.be.true;


      expect(step.findValue('x')).to.equal(12);
    });

    it('undos all queued changes', function(){
      presenter.undo();
      presenter.undo();
      presenter.undo();

      expect(presenter.spec.isDirty()).to.be.false;
      expect(presenter.spec.canRedo()).to.be.true;
      

      expect(presenter.spec.changeStatus()).to.deep.equal({applied: 0, unapplied: 3});
      expect(step.findValue('x')).to.equal(5);

    });

    it('can undo and redo changes', function(){
      presenter.undo();
      presenter.undo();

      presenter.redo();

      expect(presenter.spec.isDirty()).to.be.true;
      expect(presenter.spec.canRedo()).to.be.true;

      expect(step.findValue('x')).to.equal(12);
    });

  });

  describe('when handling a spec change from Postal subscription', function(){
    var spec = null;
    var view = null;

    beforeEach(function(){
      Postal.reset();
      Hierarchy.reset();
      Hierarchy.setLibrary(ObjectMother.library());

      var data = ObjectMother.specData();
      spec = new Specification(data, ObjectMother.library());
      spec.path = 'foo/bar';

      view = new FakeView();
      presenter = new EditorPresenter(spec);
      presenter.activate(loader, view);

      var stepId = spec.steps[0].steps[1].id;

      Postal.publish({
        channel: 'editor',
        topic: 'changes',
        data: changes.cellValue(stepId, 'x', 11)
      });
    });

    afterEach(function(){
      presenter.deactivate();
    });

    it('should update the undo/redo button states', function(){
      expect(presenter.spec.isDirty()).to.be.true;
      expect(presenter.spec.canRedo()).to.be.false;
    });

    it('should apply the change to the spec itself', function(){
      expect(spec.steps[0].steps[1].findValue('x')).to.equal(11);
    });
  });

  describe('when saving a spec', function(){
    var spec = null;
    var view = null;
    var theWrittenData = {};
    var message;

    beforeEach(function(){
      spec = {
        write: function(){
          return theWrittenData;
        },

        revision: function(){
          return 'abc'
        },

        id: uuid.v4()
      }

      view = new FakeView();
      presenter = new EditorPresenter(spec);
      presenter.refreshEditor = function(){}

      presenter.activate(loader, view);

      presenter.spec = spec;

      presenter.save();

      message = findPublishedMessage('save-spec-body');
    });

    afterEach(function(){
      presenter.deactivate();
    });

    it('should tag the message to the spec', function(){
      expect(message.id).to.equal(spec.id);
    });

    it('should send the written spec data', function(){
      expect(message.spec).to.equal(theWrittenData);
    });

    it('should send the current revision', function(){
      expect(message.revision).to.equal(spec.revision());
    });

    it('should tell the view that it is trying to save', function(){
      expect(view.state.persisting).to.be.true;
    });
  });

  describe('when receiving the spec-body-saved message', function(){
    var spec = null;
    var view = null;
    var theWrittenData = {};
    var message;
    var undoButtonsCalculated = false;

    beforeEach(function(){
      spec = {
        write: function(){
          return theWrittenData;
        },

        revision: function(){
          return 'abc'
        },

        id: uuid.v4(),

        baselineAt: function(rev){
          this.baselinedRev = rev;
        }
      }

      view = new FakeView();
      presenter = new EditorPresenter(spec);
      
      presenter.refreshEditor = function(){
        undoButtonsCalculated = true;
      }
      presenter.activate(loader, view);

      presenter.spec = spec;

      Postal.publish({
        channel: 'engine',
        topic: 'spec-body-saved',
        data: {id: spec.id, revision: 'abcd', time: '5 minutes ago'}
      })
    });

    afterEach(function(){
      presenter.deactivate();
    });

    it('should recalculate the undo button state', function(){
      expect(undoButtonsCalculated).to.be.true;
    });

    it('should tell the view that it is no longer being persisted', function(){
      expect(view.state.persisting).to.be.false;
    });

    it('should tell the view when last saved', function(){
      expect(view.state.lastSaved).to.equal('5 minutes ago');
    });

  });

  describe('when running a spec from the editor', function(){
    var theSpec = null;
    var thePresenter = null;
    var view = null;
    var theWrittenData = {};
    var message;
    var navigatedToResults = false;

    beforeEach(function(){
      theSpec = {
        write: function(){
          return theWrittenData;
        },

        revision: function(){
          return 'abc'
        },

        id: 'the-spec',

        baselineAt: function(rev){
          this.baselinedRev = rev;
        },

        changeStatus: function(){
          return {applied: 0, unapplied: 0}
        },

        outline: function(){
          return {};
        }
      }

      view = new FakeView();
      view.gotoResults = function(){
        navigatedToResults = true;
      }


      thePresenter = new EditorPresenter(theSpec);
      thePresenter.activate(loader, view);

      thePresenter.spec = theSpec;

      thePresenter.run();

      message = findPublishedMessage('run-spec');
    });

    afterEach(function(){
      thePresenter.deactivate();
    });

    it('should also save the spec', () => {
      var saved = findPublishedMessage('save-spec-body');
      expect(saved).to.not.be.null;
    });


    it('should send the message with the id and packed data and navigate to the results', function(){
      expect(message).to.deep.equal({
        id: theSpec.id,
        spec: theWrittenData,
        channel: 'engine-request',
        topic: 'run-spec',
        revision: 'abc'
      });

      expect(navigatedToResults).to.be.true;
    });
  });

  describe('when the spec date is bumped', function () {
    var theSpec;
    beforeEach(function () {
      theSpec = ObjectMother.specData();
      presenter = new EditorPresenter(theSpec);
      presenter.activate(loader, view);
    });

    afterEach(function () {
      presenter.deactivate();
    })

    it('sets state of the view to updatingDate', function () {
      presenter.specDateUpdating();
      expect(view.state.updatingDate).to.be.true;
    });

    it('sets the state of the view to not updatingDate', function () {
      presenter.specDateUpdated();
      expect(view.state.updatingDate).to.be.false;
    });

    it('sets the state of the spec to the new info', function () {
      expect(view.state.spec).to.equal(theSpec);

      var newSpec = ObjectMother.specData();
      newSpec.title = 'A brand new spec';
      Hierarchy.storeData(newSpec.id, newSpec);
      presenter.specDateUpdated();

      expect(view.state.spec.title).to.equal(newSpec.title);
    });
  });
});
