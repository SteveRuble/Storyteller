﻿using System.Collections.Generic;
using System.Diagnostics;
using FubuCore;
using NUnit.Framework;
using StoryTeller.Model;
using StoryTeller.Model.Persistence;
using StoryTeller.Remotes.Messaging;

namespace StoryTeller.Testing
{
    [TestFixture]
    public class recording_json_for_client_development
    {
        [Test]
        public void record_specification_json()
        {
            var hierarchy = TestingContext.Hierarchy;
            var dictionary = new Dictionary<string, Specification>();

            hierarchy.GetAllSpecs().Each(x =>
            {
                var spec = XmlReader.ReadFromFile(x.Filename);
                dictionary.Add(x.id, spec);
            });

            var json = JsonSerialization.ToIndentedJson(dictionary);

            new FileSystem().WriteStringToFile("specs.js", "module.exports = " + json);
        }

        [Test]
        public void write_the_table5_spec()
        {
            var hierarchy = TestingContext.Hierarchy;
            var spec = hierarchy.ToHierarchy().Specifications["table5"];
            var specification = XmlReader.ReadFromFile(spec.Filename);

            var json = JsonSerialization.ToIndentedJson(specification);

            Debug.WriteLine(json);
        }
    }
}